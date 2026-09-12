package com.automationportal.apitesting.group;

import com.automationportal.apitesting.audit.AuditLog;
import com.automationportal.apitesting.audit.AuditService;
import com.automationportal.apitesting.baseapi.ApiVariableBinding;
import com.automationportal.apitesting.baseapi.ApiVariableBindingRepository;
import com.automationportal.apitesting.baseapi.BaseApi;
import com.automationportal.apitesting.baseapi.BaseApiRepository;
import com.automationportal.apitesting.history.ExecutionHistory;
import com.automationportal.apitesting.history.ExecutionHistoryRepository;
import com.automationportal.apitesting.module.ApiModuleRepository;
import com.automationportal.apitesting.regularapi.RegularApi;
import com.automationportal.apitesting.regularapi.RegularApiRepository;
import com.automationportal.apitesting.security.CurrentProjectService;
import com.automationportal.apitesting.security.CurrentUserService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Execution groups: module-wise or time-wise sets of Regular APIs with
 * group-level execution, health and drill-down (per-API status, connected
 * Base API status, and the actual failure reason).
 */
@RestController
@RequestMapping("/api/v1/groups")
@RequiredArgsConstructor
public class GroupController {

    private final ApiGroupRepository groupRepository;
    private final ApiGroupMemberRepository memberRepository;
    private final ApiGroupExecutionRepository executionRepository;
    private final RegularApiRepository regularApiRepository;
    private final ApiVariableBindingRepository bindingRepository;
    private final BaseApiRepository baseApiRepository;
    private final ExecutionHistoryRepository historyRepository;
    private final GroupExecutionService groupExecutionService;
    private final AuditService auditService;
    private final CurrentProjectService currentProjectService;
    private final ApiModuleRepository moduleRepository;
    private final CurrentUserService currentUserService;

    // ------------------------------------------------------------- payloads

    @Data
    public static class GroupPayload {
        @NotBlank private String name;
        private String description;
        @NotNull private ApiGroup.GroupType groupType;
        private Long moduleId;                       // MODULE groups
        private ApiGroup.TimeFrequency timeFrequency; // TIME groups
        private boolean emailReport;                 // email the report after a manual run
    }

    @Data
    public static class MemberPayload {
        @NotNull private Long regularApiId;
    }

    // ---------------------------------------------------------------- views

    /** List row: group + membership count + latest execution health. */
    @Data
    public static class GroupSummary {
        private ApiGroup group;
        private long memberCount;
        private ApiGroupExecution lastExecution;
    }

    /** Per-member drill-down: API status, connected Base APIs, failure reason. */
    @Data
    public static class MemberDetail {
        private Long regularApiId;
        private String name;
        private String method;
        private String url;
        private boolean dynamic;
        private String lastStatusClass;
        private Integer lastStatusCode;
        private String lastErrorMessage;
        private String lastExecutedAt;
        private List<BaseApiStatus> baseApis = new ArrayList<>();
        private List<RegularApiStatus> regularDependencies = new ArrayList<>();
    }

    @Data
    public static class BaseApiStatus {
        private Long baseApiId;
        private String name;
        private String lastStatusClass;
        private Integer lastStatusCode;
        private String lastErrorMessage;
        private String lastExecutedAt;
    }

    /** Same idea as BaseApiStatus, for a binding sourced from another Regular API instead of a Base API. */
    @Data
    public static class RegularApiStatus {
        private Long regularApiId;
        private String name;
        private String lastStatusClass;
        private Integer lastStatusCode;
        private String lastErrorMessage;
        private String lastExecutedAt;
    }

    @Data
    public static class GroupDetail {
        private ApiGroup group;
        private ApiGroupExecution lastExecution;
        private List<MemberDetail> members = new ArrayList<>();
    }

    @Data
    public static class GroupExecutionDetail {
        private ApiGroupExecution execution;
        private String groupName;
        private List<ExecutionHistory> executions;
    }

    // ------------------------------------------------------------ group CRUD

    @GetMapping
    public List<GroupSummary> list() {
        return groupRepository.findByProjectIdOrderByUpdatedAtDesc(currentProjectService.requireProjectId()).stream().map(g -> {
            GroupSummary s = new GroupSummary();
            s.setGroup(g);
            s.setMemberCount(memberRepository.countByGroupId(g.getId()));
            s.setLastExecution(executionRepository.findFirstByGroupIdOrderByStartedAtDesc(g.getId()));
            return s;
        }).toList();
    }

    @PostMapping
    public ApiGroup create(@Valid @RequestBody GroupPayload payload) {
        Long projectId = currentProjectService.requireProjectId();
        if (groupRepository.existsByProjectIdAndNameIgnoreCase(projectId, payload.getName().trim())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A group with this name already exists");
        }
        ApiGroup group = new ApiGroup();
        apply(group, payload);
        group.setProjectId(projectId);
        validateModule(group.getModuleId(), projectId);
        group = groupRepository.save(group);
        auditService.record(projectId, AuditLog.EntityType.GROUP, group.getId(), AuditLog.Action.CREATE,
                "Created group '" + group.getName() + "' (" + group.getGroupType() + ")");
        return group;
    }

    @PutMapping("/{id}")
    public ApiGroup update(@PathVariable Long id, @Valid @RequestBody GroupPayload payload) {
        ApiGroup group = find(id);
        apply(group, payload);
        validateModule(group.getModuleId(), group.getProjectId());
        group = groupRepository.save(group);
        auditService.record(currentProjectService.requireProjectId(), AuditLog.EntityType.GROUP, id, AuditLog.Action.UPDATE,
                "Updated group '" + group.getName() + "'");
        return group;
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        ApiGroup group = find(id);
        groupRepository.delete(group);
        auditService.record(currentProjectService.requireProjectId(), AuditLog.EntityType.GROUP, id, AuditLog.Action.DELETE,
                "Deleted group '" + group.getName() + "'");
    }

    // ------------------------------------------------------------ drill-down

    /** Group page: members with per-API status, Base API status and failure reason. */
    @GetMapping("/{id}")
    public GroupDetail detail(@PathVariable Long id) {
        ApiGroup group = find(id);
        GroupDetail detail = new GroupDetail();
        detail.setGroup(group);
        detail.setLastExecution(executionRepository.findFirstByGroupIdOrderByStartedAtDesc(id));

        for (ApiGroupMember member : memberRepository.findByGroupIdOrderBySeqAsc(id)) {
            RegularApi api = regularApiRepository.findById(member.getRegularApiId()).orElse(null);
            MemberDetail md = new MemberDetail();
            md.setRegularApiId(member.getRegularApiId());
            if (api == null) {
                md.setName("(deleted)");
                detail.getMembers().add(md);
                continue;
            }
            md.setName(api.getName());
            md.setMethod(api.getMethod());
            md.setUrl(api.getUrlTemplate());
            md.setDynamic(api.isDynamic());

            ExecutionHistory last = historyRepository
                    .findFirstByApiTypeAndApiIdOrderByExecutedAtDesc(ExecutionHistory.ApiType.REGULAR, api.getId());
            if (last != null) {
                md.setLastStatusClass(last.getResponseStatusClass());
                md.setLastStatusCode(last.getResponseStatusCode());
                md.setLastErrorMessage(last.getErrorMessage());
                md.setLastExecutedAt(last.getExecutedAt().toString());
            }

            // Connected Base APIs / Regular APIs and their own latest statuses —
            // so a failing member can be traced to the dependency that actually
            // broke, however many hops deep (a binding sources from exactly one
            // of the two; each set only collects the bindings of its own kind).
            Set<Long> baseIds = new LinkedHashSet<>();
            Set<Long> regularIds = new LinkedHashSet<>();
            for (ApiVariableBinding b : bindingRepository.findByRegularApiId(api.getId())) {
                if (b.getBaseApiId() != null) baseIds.add(b.getBaseApiId());
                else if (b.getSourceRegularApiId() != null) regularIds.add(b.getSourceRegularApiId());
            }
            for (Long baseId : baseIds) {
                BaseApi base = baseApiRepository.findById(baseId).orElse(null);
                BaseApiStatus bs = new BaseApiStatus();
                bs.setBaseApiId(baseId);
                bs.setName(base == null ? "(deleted)" : base.getName());
                ExecutionHistory baseLast = historyRepository
                        .findFirstByApiTypeAndApiIdOrderByExecutedAtDesc(ExecutionHistory.ApiType.BASE, baseId);
                if (baseLast != null) {
                    bs.setLastStatusClass(baseLast.getResponseStatusClass());
                    bs.setLastStatusCode(baseLast.getResponseStatusCode());
                    bs.setLastErrorMessage(baseLast.getErrorMessage());
                    bs.setLastExecutedAt(baseLast.getExecutedAt().toString());
                }
                md.getBaseApis().add(bs);
            }
            for (Long regularId : regularIds) {
                RegularApi source = regularApiRepository.findById(regularId).orElse(null);
                RegularApiStatus rs = new RegularApiStatus();
                rs.setRegularApiId(regularId);
                rs.setName(source == null ? "(deleted)" : source.getName());
                ExecutionHistory regularLast = historyRepository
                        .findFirstByApiTypeAndApiIdOrderByExecutedAtDesc(ExecutionHistory.ApiType.REGULAR, regularId);
                if (regularLast != null) {
                    rs.setLastStatusClass(regularLast.getResponseStatusClass());
                    rs.setLastStatusCode(regularLast.getResponseStatusCode());
                    rs.setLastErrorMessage(regularLast.getErrorMessage());
                    rs.setLastExecutedAt(regularLast.getExecutedAt().toString());
                }
                md.getRegularDependencies().add(rs);
            }
            detail.getMembers().add(md);
        }
        return detail;
    }

    // --------------------------------------------------------------- members

    @PostMapping("/{id}/members")
    public ApiGroupMember addMember(@PathVariable Long id, @Valid @RequestBody MemberPayload payload) {
        ApiGroup group = find(id);
        RegularApi api = regularApiRepository.findById(payload.getRegularApiId())
                .filter(a -> group.getProjectId().equals(a.getProjectId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Regular API does not exist"));
        if (memberRepository.existsByGroupIdAndRegularApiId(id, api.getId())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "API is already in this group");
        }
        ApiGroupMember member = new ApiGroupMember();
        member.setGroupId(id);
        member.setRegularApiId(api.getId());
        member.setSeq((int) memberRepository.countByGroupId(id));
        member = memberRepository.save(member);
        auditService.record(currentProjectService.requireProjectId(), AuditLog.EntityType.GROUP, id, AuditLog.Action.UPDATE,
                "Added API '" + api.getName() + "' to group '" + group.getName() + "'");
        return member;
    }

    @Transactional
    @DeleteMapping("/{id}/members/{regularApiId}")
    public void removeMember(@PathVariable Long id, @PathVariable Long regularApiId) {
        ApiGroup group = find(id);
        memberRepository.deleteByGroupIdAndRegularApiId(id, regularApiId);
        auditService.record(currentProjectService.requireProjectId(), AuditLog.EntityType.GROUP, id, AuditLog.Action.UPDATE,
                "Removed API #" + regularApiId + " from group '" + group.getName() + "'");
    }

    /** Which groups contain this API — used by the Regular API editor. */
    @GetMapping("/by-api/{regularApiId}")
    public List<Long> groupsForApi(@PathVariable Long regularApiId) {
        RegularApi api = regularApiRepository.findById(regularApiId)
                .filter(a -> currentProjectService.requireProjectId().equals(a.getProjectId()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Regular API not found"));
        return memberRepository.findByRegularApiId(api.getId()).stream()
                .map(ApiGroupMember::getGroupId)
                .toList();
    }

    // ------------------------------------------------------------- execution

    /** Run the whole group now (async — returns the RUNNING execution row). */
    @PostMapping("/{id}/execute")
    public ApiGroupExecution execute(@PathVariable Long id) {
        ApiGroup group = find(id);
        if (memberRepository.countByGroupId(id) == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Group has no APIs to execute");
        }
        auditService.record(currentProjectService.requireProjectId(), AuditLog.EntityType.GROUP, id, AuditLog.Action.EXECUTE,
                "Manual execution of group '" + group.getName() + "'");
        return groupExecutionService.executeAsync(group, currentUserService.currentEmail());
    }

    @GetMapping("/executions")
    public Page<ApiGroupExecution> executions(@RequestParam(required = false) Long groupId,
                                              @RequestParam(defaultValue = "0") int page,
                                              @RequestParam(defaultValue = "25") int size) {
        PageRequest pr = PageRequest.of(page, Math.min(size, 100));
        if (groupId == null) {
            return executionRepository.findByProjectIdOrderByStartedAtDesc(currentProjectService.requireProjectId(), pr);
        }
        find(groupId);
        return executionRepository.findByGroupIdOrderByStartedAtDesc(groupId, pr);
    }

    /** One group run with every API execution it produced (light rows). */
    @GetMapping("/executions/{executionId}")
    public GroupExecutionDetail executionDetail(@PathVariable Long executionId) {
        ApiGroupExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group execution not found"));
        if (!currentProjectService.requireProjectId().equals(execution.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Group execution not found");
        }
        GroupExecutionDetail d = new GroupExecutionDetail();
        d.setExecution(execution);
        d.setGroupName(groupRepository.findById(execution.getGroupId())
                .map(ApiGroup::getName).orElse("(deleted)"));
        List<ExecutionHistory> rows = historyRepository.findByGroupExecutionIdOrderByExecutedAtAsc(executionId);
        rows.forEach(h -> {
            h.setResponseBodyInline(null);
            h.setRequestBody(null);
            h.setResponseHeaders(null);
            h.setRequestHeaders(null);
            h.setResponseCookies(null);
        });
        d.setExecutions(rows);
        return d;
    }

    // ---------------------------------------------------------------- helpers

    private void validateModule(Long moduleId, Long projectId) {
        if (moduleId == null) return;
        boolean owned = moduleRepository.findById(moduleId).map(m -> projectId.equals(m.getProjectId())).orElse(false);
        if (!owned) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Module does not exist");
        }
    }

    private ApiGroup find(Long id) {
        ApiGroup group = groupRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found"));
        if (!currentProjectService.requireProjectId().equals(group.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Group not found");
        }
        return group;
    }

    private void apply(ApiGroup group, GroupPayload p) {
        group.setName(p.getName().trim());
        group.setDescription(p.getDescription());
        group.setGroupType(p.getGroupType());
        group.setEmailReport(p.isEmailReport());
        if (p.getGroupType() == ApiGroup.GroupType.MODULE) {
            group.setModuleId(p.getModuleId());
            group.setTimeFrequency(null);
        } else {
            group.setModuleId(null);
            group.setTimeFrequency(p.getTimeFrequency() == null ? ApiGroup.TimeFrequency.NOW : p.getTimeFrequency());
        }
    }
}

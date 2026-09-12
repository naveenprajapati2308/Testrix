package com.testrix.platform.workspace;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ProjectUserRepository extends JpaRepository<ProjectUser, Long> {
    List<ProjectUser> findByUserId(Long userId);
    List<ProjectUser> findByUserIdAndStatus(Long userId, ProjectUserStatus status);
    List<ProjectUser> findByProjectId(Long projectId);
    List<ProjectUser> findByProjectIdAndStatus(Long projectId, ProjectUserStatus status);
    List<ProjectUser> findByProjectIdAndUserId(Long projectId, Long userId);
    Optional<ProjectUser> findByProjectIdAndUserIdAndRoleId(Long projectId, Long userId, Long roleId);
    long countByProjectIdAndRoleCodeAndStatus(Long projectId, String roleCode, ProjectUserStatus status);
    long countByRoleCodeAndStatus(String roleCode, ProjectUserStatus status);
}

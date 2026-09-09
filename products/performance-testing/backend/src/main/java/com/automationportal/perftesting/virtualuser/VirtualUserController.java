package com.automationportal.perftesting.virtualuser;

import com.automationportal.perftesting.common.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/virtual-users")
@RequiredArgsConstructor
public class VirtualUserController {

    private final VirtualUserService service;

    @GetMapping
    public ApiResponse<List<VirtualUserDto>> getAll() {
        return ApiResponse.ok(service.getAll());
    }

    @GetMapping("/{id}")
    public ApiResponse<VirtualUserDto> getById(@PathVariable Long id) {
        return ApiResponse.ok(service.getById(id));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<VirtualUserDto> create(@Valid @RequestBody VirtualUserDto dto) {
        return ApiResponse.created("Virtual User created successfully", service.create(dto));
    }

    @PutMapping("/{id}")
    public ApiResponse<VirtualUserDto> update(@PathVariable Long id, @Valid @RequestBody VirtualUserDto dto) {
        return ApiResponse.ok(service.update(id, dto));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ApiResponse.ok(null);
    }

    @PostMapping("/{id}/clone")
    public ApiResponse<VirtualUserDto> clone(@PathVariable Long id) {
        return ApiResponse.ok(service.clone(id));
    }

    @PostMapping(value = "/import", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<List<VirtualUserDto>> importCsv(@RequestParam("file") org.springframework.web.multipart.MultipartFile file) {
        try {
            return ApiResponse.ok(service.importCsv(file.getInputStream()));
        } catch (Exception e) {
            throw com.automationportal.perftesting.common.ApiException.badRequest("CSV Import failed: " + e.getMessage());
        }
    }
}

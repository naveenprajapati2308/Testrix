package com.automationportal.apitesting.validation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BusinessValidationRunRepository extends JpaRepository<BusinessValidationRun, Long> {

    List<BusinessValidationRun> findByProjectIdAndApiTypeAndApiIdOrderByCreatedAtDesc(
            Long projectId, BusinessValidationRun.ApiType apiType, Long apiId);

    Optional<BusinessValidationRun> findFirstByProjectIdAndApiTypeAndApiIdOrderByCreatedAtDesc(
            Long projectId, BusinessValidationRun.ApiType apiType, Long apiId);

    Optional<BusinessValidationRun> findByExecutionHistoryId(Long executionHistoryId);
}

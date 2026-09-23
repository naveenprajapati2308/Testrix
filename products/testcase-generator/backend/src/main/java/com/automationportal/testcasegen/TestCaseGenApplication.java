package com.automationportal.testcasegen;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class TestCaseGenApplication {
    public static void main(String[] args) {
        SpringApplication.run(TestCaseGenApplication.class, args);
    }
}

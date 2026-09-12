package com.automationportal.security;

public final class ProjectContextHolder {
    private static final ThreadLocal<ProjectContext> CURRENT = new ThreadLocal<>();

    private ProjectContextHolder() {
    }

    public static void set(ProjectContext context) {
        CURRENT.set(context);
    }

    public static ProjectContext get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}

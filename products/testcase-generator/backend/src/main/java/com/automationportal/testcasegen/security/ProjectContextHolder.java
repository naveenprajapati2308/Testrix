package com.automationportal.testcasegen.security;

/** Request-scoped Tenant/Project context, populated by JwtValidationFilter from the token's
 * claims and cleared at the end of every request. Null for Super Admin (no project) and for a
 * user who hasn't selected a project yet — callers must handle that explicitly.
 *
 * Only ever populated on request threads: a background generation worker sees null here, so it
 * must carry the project id explicitly off the srs_documents row instead. */
public final class ProjectContextHolder {
    private static final ThreadLocal<ProjectContext> CURRENT = new ThreadLocal<>();

    private ProjectContextHolder() {}

    public static void set(ProjectContext context) { CURRENT.set(context); }
    public static ProjectContext get() { return CURRENT.get(); }
    public static void clear() { CURRENT.remove(); }
}

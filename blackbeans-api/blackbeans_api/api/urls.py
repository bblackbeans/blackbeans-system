from django.urls import path

from blackbeans_api.api.auth_views import AdminToken2FAVerifyView
from blackbeans_api.api.auth_views import AdminTokenObtainPairView
from blackbeans_api.api.auth_views import AdminTokenRefreshView
from blackbeans_api.api.auth_views import Auth2FADisableView
from blackbeans_api.api.auth_views import Auth2FAEnrollConfirmView
from blackbeans_api.api.auth_views import Auth2FAEnrollStartView
from blackbeans_api.api.auth_views import Auth2FASettingsView
from blackbeans_api.api.agents_views import AgentListView
from blackbeans_api.api.agents_views import AgentRunDetailView
from blackbeans_api.api.agents_views import AgentRunListView
from blackbeans_api.api.agents_views import AgentRunNowView
from blackbeans_api.api.audit_views import AuditDashboardView
from blackbeans_api.api.audit_views import AuditLogsView
from blackbeans_api.api.collaborators_views import AdminCollaboratorDepartmentLinkView
from blackbeans_api.api.collaborators_views import AdminCollaboratorDetailView
from blackbeans_api.api.collaborators_views import AdminCollaboratorListCreateView
from blackbeans_api.api.clients_views import ClientDetailView
from blackbeans_api.api.clients_views import ClientsListCreateView
from blackbeans_api.api.clients_views import ClientStatusToggleView
from blackbeans_api.api.feedback_views import ProblemReportDetailView
from blackbeans_api.api.feedback_views import ProblemReportFeedbackCreateView
from blackbeans_api.api.feedback_views import ProblemReportsListView
from blackbeans_api.api.bpo_views import ContractCancelView
from blackbeans_api.api.bpo_views import ContractConfirmView
from blackbeans_api.api.bpo_views import ContractReactivateView
from blackbeans_api.api.bpo_views import ContractDetailView
from blackbeans_api.api.bpo_views import ContractListCreateView
from blackbeans_api.api.bpo_views import ServiceCatalogDetailView
from blackbeans_api.api.bpo_views import ServiceCatalogListCreateView
from blackbeans_api.api.operations_views import PortfolioDetailView
from blackbeans_api.api.operations_views import PortfolioListCreateView
from blackbeans_api.api.operations_views import BoardListCreateView
from blackbeans_api.api.operations_views import BoardGroupListCreateView
from blackbeans_api.api.operations_views import BoardGroupDetailView
from blackbeans_api.api.operations_views import BoardDetailView
from blackbeans_api.api.operations_views import BoardProgressView
from blackbeans_api.api.notification_views import BoardWatchView
from blackbeans_api.api.notification_views import MeNotificationPreferencesView
from blackbeans_api.api.notification_views import MeNotificationSubscriptionsView
from blackbeans_api.api.notification_views import NotificationUnsubscribeView
from blackbeans_api.api.notification_views import NotificationsReadAllView
from blackbeans_api.api.notification_views import TaskWatchView
from blackbeans_api.api.operations_views import NotificationsDeadlineScanView
from blackbeans_api.api.operations_views import NotificationsListView
from blackbeans_api.api.operations_views import NotificationsUnreadCountView
from blackbeans_api.api.operations_views import NotificationReadView
from blackbeans_api.api.operations_views import TaskActivityView
from blackbeans_api.api.operations_views import TaskAssigneeView
from blackbeans_api.api.operations_views import TaskAttachmentsView
from blackbeans_api.api.operations_views import TaskCompleteView
from blackbeans_api.api.operations_views import TaskCommentsView
from blackbeans_api.api.operations_views import TaskCommentDetailView
from blackbeans_api.api.operations_views import TaskDependenciesView
from blackbeans_api.api.operations_views import TaskDetailView
from blackbeans_api.api.operations_views import TaskListCreateView
from blackbeans_api.api.operations_views import TaskStatusView
from blackbeans_api.api.operations_views import TaskTimePauseView
from blackbeans_api.api.operations_views import TaskTimeResumeView
from blackbeans_api.api.operations_views import TaskTimeStartView
from blackbeans_api.api.operations_views import TaskTimeSummaryView
from blackbeans_api.api.operations_views import TimeLogDetailView
from blackbeans_api.api.operations_views import TimeLogsListView
from blackbeans_api.api.operations_views import MyTasksView
from blackbeans_api.api.operations_views import PortfolioStatsView
from blackbeans_api.api.operations_views import ProjectDetailView
from blackbeans_api.api.operations_views import ProjectListCreateView
from blackbeans_api.api.operations_views import ProjectMetricsView
from blackbeans_api.api.operations_views import ProjectScheduleView
from blackbeans_api.api.operations_views import ProjectStatusView
from blackbeans_api.api.operations_views import ProjectStatsView
from blackbeans_api.api.operations_views import WorkspaceStatsView
from blackbeans_api.api.operations_views import WorkspaceDetailView
from blackbeans_api.api.operations_views import WorkspaceListCreateView
from blackbeans_api.api.collaborators_views import MeCollaboratorProfileView
from blackbeans_api.api.collaborators_views import MeView
from blackbeans_api.api.permissions_views import PermissionAssignmentsView
from blackbeans_api.api.permissions_views import PermissionBulkApplyView
from blackbeans_api.api.permissions_views import PermissionBulkPreviewView
from blackbeans_api.api.permissions_views import PermissionConflictResolvePreviewView
from blackbeans_api.api.permissions_views import PermissionConflictResolveView
from blackbeans_api.api.permissions_views import PermissionsMatrixView
from blackbeans_api.api.system_views import HealthCheckView
from blackbeans_api.api.users_views import AdminUserCollaboratorLinkDetailView
from blackbeans_api.api.users_views import AdminUserCollaboratorLinkView
from blackbeans_api.api.users_views import AdminUserDetailView
from blackbeans_api.api.users_views import AdminUserListCreateView
from blackbeans_api.api.users_views import AdminUserWorkspaceAccessView
from blackbeans_api.api.users_views import AssigneeDirectoryView
from blackbeans_api.api.users_views import MeAvatarView
from blackbeans_api.api.users_views import MeWorkspaceAccessView

urlpatterns = [
    path("services", ServiceCatalogListCreateView.as_view(), name="services-list-create"),
    path("services/<uuid:service_id>", ServiceCatalogDetailView.as_view(), name="services-detail"),
    path("contracts", ContractListCreateView.as_view(), name="contracts-list-create"),
    path("contracts/<uuid:contract_id>", ContractDetailView.as_view(), name="contracts-detail"),
    path("contracts/<uuid:contract_id>/confirm", ContractConfirmView.as_view(), name="contracts-confirm"),
    path("contracts/<uuid:contract_id>/cancel", ContractCancelView.as_view(), name="contracts-cancel"),
    path("contracts/<uuid:contract_id>/reactivate", ContractReactivateView.as_view(), name="contracts-reactivate"),
    path("clients", ClientsListCreateView.as_view(), name="clients-list-create"),
    path("clients/<uuid:client_id>/status-toggle", ClientStatusToggleView.as_view(), name="clients-status-toggle"),
    path("clients/<uuid:client_id>", ClientDetailView.as_view(), name="clients-detail"),
    path("workspaces", WorkspaceListCreateView.as_view(), name="workspaces-list-create"),
    path("workspaces/<uuid:workspace_id>", WorkspaceDetailView.as_view(), name="workspaces-detail"),
    path("workspaces/<uuid:workspace_id>/stats", WorkspaceStatsView.as_view(), name="workspaces-stats"),
    path("portfolios", PortfolioListCreateView.as_view(), name="portfolios-list-create"),
    path("portfolios/<uuid:portfolio_id>", PortfolioDetailView.as_view(), name="portfolios-detail"),
    path("portfolios/<uuid:portfolio_id>/stats", PortfolioStatsView.as_view(), name="portfolios-stats"),
    path("projects", ProjectListCreateView.as_view(), name="projects-list-create"),
    path("boards", BoardListCreateView.as_view(), name="boards-list-create"),
    path("boards/<uuid:board_id>", BoardDetailView.as_view(), name="boards-detail"),
    path("boards/<uuid:board_id>/groups", BoardGroupListCreateView.as_view(), name="boards-groups-list-create"),
    path("boards/<uuid:board_id>/progress", BoardProgressView.as_view(), name="boards-progress"),
    path("groups/<uuid:group_id>", BoardGroupDetailView.as_view(), name="groups-detail"),
    path("tasks", TaskListCreateView.as_view(), name="tasks-list-create"),
    path("tasks/<uuid:task_id>", TaskDetailView.as_view(), name="tasks-detail"),
    path("tasks/<uuid:task_id>/assignee", TaskAssigneeView.as_view(), name="tasks-assignee"),
    path("tasks/<uuid:task_id>/dependencies", TaskDependenciesView.as_view(), name="tasks-dependencies"),
    path("tasks/<uuid:task_id>/status", TaskStatusView.as_view(), name="tasks-status"),
    path("tasks/<uuid:task_id>/time/start", TaskTimeStartView.as_view(), name="tasks-time-start"),
    path("tasks/<uuid:task_id>/time/pause", TaskTimePauseView.as_view(), name="tasks-time-pause"),
    path("tasks/<uuid:task_id>/time/resume", TaskTimeResumeView.as_view(), name="tasks-time-resume"),
    path("tasks/<uuid:task_id>/complete", TaskCompleteView.as_view(), name="tasks-complete"),
    path("tasks/<uuid:task_id>/time-summary", TaskTimeSummaryView.as_view(), name="tasks-time-summary"),
    path("tasks/<uuid:task_id>/comments", TaskCommentsView.as_view(), name="tasks-comments"),
    path("tasks/<uuid:task_id>/comments/<uuid:comment_id>", TaskCommentDetailView.as_view(), name="tasks-comments-detail"),
    path("tasks/<uuid:task_id>/attachments", TaskAttachmentsView.as_view(), name="tasks-attachments"),
    path("tasks/<uuid:task_id>/activity", TaskActivityView.as_view(), name="tasks-activity"),
    path("time-logs", TimeLogsListView.as_view(), name="time-logs-list"),
    path("time-logs/<uuid:time_log_id>", TimeLogDetailView.as_view(), name="time-logs-detail"),
    path("my-tasks", MyTasksView.as_view(), name="my-tasks"),
    path("notifications", NotificationsListView.as_view(), name="notifications-list"),
    path("notifications/unread-count", NotificationsUnreadCountView.as_view(), name="notifications-unread-count"),
    path("notifications/read-all", NotificationsReadAllView.as_view(), name="notifications-read-all"),
    path("notifications/unsubscribe", NotificationUnsubscribeView.as_view(), name="notifications-unsubscribe"),
    path("notifications/<uuid:notification_id>/read", NotificationReadView.as_view(), name="notifications-read"),
    path("notifications/deadline-scan", NotificationsDeadlineScanView.as_view(), name="notifications-deadline-scan"),
    path("agents", AgentListView.as_view(), name="agents-list"),
    path("agents/<slug:slug>/runs", AgentRunListView.as_view(), name="agents-runs"),
    path("agents/<slug:slug>/runs/<uuid:run_id>", AgentRunDetailView.as_view(), name="agents-run-detail"),
    path("agents/<slug:slug>/run", AgentRunNowView.as_view(), name="agents-run-now"),
    path("me/notification-preferences", MeNotificationPreferencesView.as_view(), name="me-notification-preferences"),
    path(
        "me/notification-subscriptions",
        MeNotificationSubscriptionsView.as_view(),
        name="me-notification-subscriptions",
    ),
    path("tasks/<uuid:task_id>/watch", TaskWatchView.as_view(), name="tasks-watch"),
    path("boards/<uuid:board_id>/watch", BoardWatchView.as_view(), name="boards-watch"),
    path("projects/<uuid:project_id>", ProjectDetailView.as_view(), name="projects-detail"),
    path("projects/<uuid:project_id>/status", ProjectStatusView.as_view(), name="projects-status"),
    path("projects/<uuid:project_id>/schedule", ProjectScheduleView.as_view(), name="projects-schedule"),
    path("projects/<uuid:project_id>/metrics", ProjectMetricsView.as_view(), name="projects-metrics"),
    path("projects/<uuid:project_id>/stats", ProjectStatsView.as_view(), name="projects-stats"),
    path("audit/dashboard", AuditDashboardView.as_view(), name="audit-dashboard"),
    path("audit/logs", AuditLogsView.as_view(), name="audit-logs"),
    path("health", HealthCheckView.as_view(), name="health"),
    path(
        "me/collaborator-profile",
        MeCollaboratorProfileView.as_view(),
        name="me-collaborator-profile",
    ),
    path(
        "me/workspace-access",
        MeWorkspaceAccessView.as_view(),
        name="me-workspace-access",
    ),
    path("me", MeView.as_view(), name="me"),
    path("me/avatar", MeAvatarView.as_view(), name="me-avatar"),
    path("assignees", AssigneeDirectoryView.as_view(), name="assignees-directory"),
    path(
        "permissions/bulk/preview",
        PermissionBulkPreviewView.as_view(),
        name="permissions-bulk-preview",
    ),
    path(
        "permissions/bulk/apply",
        PermissionBulkApplyView.as_view(),
        name="permissions-bulk-apply",
    ),
    path(
        "permissions/conflicts/resolve-preview",
        PermissionConflictResolvePreviewView.as_view(),
        name="permissions-conflicts-resolve-preview",
    ),
    path(
        "permissions/conflicts/resolve",
        PermissionConflictResolveView.as_view(),
        name="permissions-conflicts-resolve",
    ),
    path(
        "permissions/matrix",
        PermissionsMatrixView.as_view(),
        name="permissions-matrix",
    ),
    path(
        "permissions/assignments",
        PermissionAssignmentsView.as_view(),
        name="permissions-assignments",
    ),
    path("auth/tokens", AdminTokenObtainPairView.as_view(), name="auth-token-obtain"),
    path(
        "auth/tokens/2fa/verify",
        AdminToken2FAVerifyView.as_view(),
        name="auth-token-2fa-verify",
    ),
    path(
        "auth/tokens/refresh",
        AdminTokenRefreshView.as_view(),
        name="auth-token-refresh",
    ),
    path("auth/2fa/settings", Auth2FASettingsView.as_view(), name="auth-2fa-settings"),
    path("auth/2fa/enroll/start", Auth2FAEnrollStartView.as_view(), name="auth-2fa-enroll-start"),
    path("auth/2fa/enroll/confirm", Auth2FAEnrollConfirmView.as_view(), name="auth-2fa-enroll-confirm"),
    path("auth/2fa/disable", Auth2FADisableView.as_view(), name="auth-2fa-disable"),
    path(
        "collaborators/<uuid:collaborator_id>/department-links",
        AdminCollaboratorDepartmentLinkView.as_view(),
        name="collaborators-department-links",
    ),
    path(
        "collaborators/<uuid:collaborator_id>",
        AdminCollaboratorDetailView.as_view(),
        name="collaborators-detail",
    ),
    path(
        "collaborators",
        AdminCollaboratorListCreateView.as_view(),
        name="collaborators-list-create",
    ),
    path(
        "users/<int:user_id>/workspace-access",
        AdminUserWorkspaceAccessView.as_view(),
        name="users-workspace-access",
    ),
    path(
        "users/<int:user_id>/collaborator-links/<uuid:collaborator_id>",
        AdminUserCollaboratorLinkDetailView.as_view(),
        name="users-collaborator-link-detail",
    ),
    path(
        "users/<int:user_id>/collaborator-links",
        AdminUserCollaboratorLinkView.as_view(),
        name="users-collaborator-links",
    ),
    path(
        "users/<int:user_id>",
        AdminUserDetailView.as_view(),
        name="users-detail",
    ),
    path("users", AdminUserListCreateView.as_view(), name="users-list-create"),
    path("problem-reports/feedback", ProblemReportFeedbackCreateView.as_view(), name="problem-reports-feedback"),
    path("problem-reports/<uuid:report_id>", ProblemReportDetailView.as_view(), name="problem-reports-detail"),
    path("problem-reports", ProblemReportsListView.as_view(), name="problem-reports-list"),
]

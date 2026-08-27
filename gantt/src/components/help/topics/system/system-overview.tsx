import { HelpH2 } from '../../help-article'

export default function SystemOverview() {
  return (
    <>
      <HelpH2>What the System tab contains</HelpH2>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        The <strong className="text-foreground">System</strong> tab groups operational tools and
        administration pages that support the scheduling platform.
      </p>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Depending on your permissions, the submenu can include scheduler status, queue tasks,
        monitoring dashboards, data-quality checks, user management, profile management, menu
        management, PBS user management, and department management.
      </p>

      <HelpH2>Access and permissions</HelpH2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        System pages are permission-controlled. If a submenu item is not visible, your current role
        does not have access to that tool.
      </p>
    </>
  )
}

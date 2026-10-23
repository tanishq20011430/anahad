import { EmptyState } from '../components/ui'

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      hint="The address doesn't match any page. Head back home to keep listening."
    />
  )
}

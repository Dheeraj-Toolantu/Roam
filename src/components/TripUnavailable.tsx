import { Empty, Header, Screen } from './ui';

/** Shown when a trip doesn't exist or the user isn't a member (rules deny the read). */
export function TripUnavailable({ title = 'Trip' }: { title?: string }) {
  return (
    <Screen>
      <Header title={title} />
      <Empty icon="lock-closed-outline" title="Trip not available" text="This trip doesn't exist or you are not a member." />
    </Screen>
  );
}

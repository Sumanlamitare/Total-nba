import { Redirect } from 'expo-router';
import { useSession } from '../lib/session';

export default function Index() {
  const { user } = useSession();
  return <Redirect href={user ? '/home' : '/welcome'} />;
}

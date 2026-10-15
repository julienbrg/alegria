import { Alert, Button, Container, Heading, Stack } from '@chakra-ui/react';
import { useSearchParams } from 'react-router';

const ERRORS: Record<string, string> = {
  refused: 'Your ENT profile is not recognised.',
  state: 'The login expired or was interrupted. Please try again.',
};

export function Login() {
  const [params] = useSearchParams();
  const error = ERRORS[params.get('error') ?? ''];

  return (
    <Container maxW="md" py="16">
      <Stack gap="6">
        <Heading>Alegria</Heading>
        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}
        <Button asChild>
          <a href="/auth/login">Log in with the ENT</a>
        </Button>
      </Stack>
    </Container>
  );
}

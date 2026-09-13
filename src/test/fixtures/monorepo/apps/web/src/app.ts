import { greet, add } from '@acme/shared';

export function page() {
  return greet('world') + String(add(1, 2));
}

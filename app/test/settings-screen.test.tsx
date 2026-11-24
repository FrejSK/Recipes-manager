import { fireEvent, render, screen } from '@testing-library/react-native';

import SettingsScreen from '../app/settings';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

it('links to categories', async () => {
  await render(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Kategórie'));
  expect(mockPush).toHaveBeenCalledWith('/categories');
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import AddScreen from '../app/add';
import { takeDraft, takePendingImport } from '../src/import/pending';

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: { Screen: () => null },
}));
const mockGetString = jest.fn(async () => '');
jest.mock('expo-clipboard', () => ({ getStringAsync: () => mockGetString() }));
const mockLibrary = jest.fn();
const mockCamera = jest.fn();
const mockCameraPerm = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (o: unknown) => mockLibrary(o),
  launchCameraAsync: (o: unknown) => mockCamera(o),
  requestCameraPermissionsAsync: () => mockCameraPerm(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  takePendingImport();
  takeDraft();
});

describe('add screen', () => {
  it('imports pasted text', async () => {
    await render(<AddScreen />);
    await fireEvent.press(screen.getByText('Vložiť text'));
    const load = () => screen.getByText('Načítať');
    expect(screen.getByRole('button', { name: 'Načítať' })).toBeDisabled();
    await fireEvent.changeText(screen.getByPlaceholderText('Sem vlož text receptu'), '  Palacinky  ');
    await fireEvent.press(load());
    expect(takePendingImport()).toEqual({ kind: 'text', text: 'Palacinky' });
    expect(mockPush).toHaveBeenCalledWith('/import');
  });

  it('pre-fills the link from the clipboard and imports it', async () => {
    mockGetString.mockResolvedValueOnce('  https://recept.sk/palacinky \n');
    await render(<AddScreen />);
    await fireEvent.press(screen.getByText('Vložiť odkaz'));
    expect(await screen.findByDisplayValue('https://recept.sk/palacinky')).toBeTruthy();
    await fireEvent.press(screen.getByText('Načítať'));
    expect(takePendingImport()).toEqual({ kind: 'url', url: 'https://recept.sk/palacinky' });
    expect(mockPush).toHaveBeenCalledWith('/import');
  });

  it('does not pre-fill non-url clipboard text', async () => {
    mockGetString.mockResolvedValueOnce('nákupný zoznam');
    await render(<AddScreen />);
    await fireEvent.press(screen.getByText('Vložiť odkaz'));
    await waitFor(() => expect(mockGetString).toHaveBeenCalled());
    expect(screen.getByPlaceholderText('https://…').props.value).toBe('');
  });

  it('imports multiple images from the gallery', async () => {
    mockLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///a.jpg' }, { uri: 'file:///b.jpg' }] });
    await render(<AddScreen />);
    await fireEvent.press(screen.getByText('Obrázok alebo screenshot'));
    await fireEvent.press(screen.getByText('Z galérie'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/import'));
    expect(mockLibrary).toHaveBeenCalledWith({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1 });
    expect(takePendingImport()).toEqual({ kind: 'images', uris: ['file:///a.jpg', 'file:///b.jpg'] });
  });

  it('does nothing when the gallery is cancelled', async () => {
    mockLibrary.mockResolvedValue({ canceled: true, assets: null });
    await render(<AddScreen />);
    await fireEvent.press(screen.getByText('Obrázok alebo screenshot'));
    await fireEvent.press(screen.getByText('Z galérie'));
    await waitFor(() => expect(mockLibrary).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('alerts when camera permission is denied', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockCameraPerm.mockResolvedValue({ granted: false });
    await render(<AddScreen />);
    await fireEvent.press(screen.getByText('Obrázok alebo screenshot'));
    await fireEvent.press(screen.getByText('Odfotiť'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Bez povolenia fotoaparátu sa nedá fotiť.'));
    expect(mockCamera).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('takes a photo', async () => {
    mockCameraPerm.mockResolvedValue({ granted: true });
    mockCamera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo.jpg' }] });
    await render(<AddScreen />);
    await fireEvent.press(screen.getByText('Obrázok alebo screenshot'));
    await fireEvent.press(screen.getByText('Odfotiť'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/import'));
    expect(mockCamera).toHaveBeenCalledWith({ mediaTypes: ['images'], quality: 1 });
    expect(takePendingImport()).toEqual({ kind: 'images', uris: ['file:///photo.jpg'] });
  });

  it('"Vyplniť ručne" goes to /new without a draft', async () => {
    await render(<AddScreen />);
    await fireEvent.press(screen.getByText('Vyplniť ručne'));
    expect(mockPush).toHaveBeenCalledWith('/new');
    expect(takeDraft()).toBeNull();
    expect(takePendingImport()).toBeNull();
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { FormGroup } from '../src/recipe/form-state';
import { IngredientsEditor } from '../src/ui/IngredientsEditor';

const item = (name: string) => ({ key: `i-${name}`, amount: '', amountMax: '', unit: null, name, note: '' });

afterEach(() => jest.restoreAllMocks());

describe('IngredientsEditor group delete', () => {
  it('deletes an empty group at once, without asking', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onChange = jest.fn();
    const groups: FormGroup[] = [
      { key: 'g1', name: 'Cesto', items: [] },
      { key: 'g2', name: 'Plnka', items: [item('tvaroh')] },
    ];
    await render(<IngredientsEditor groups={groups} onChange={onChange} />);
    await fireEvent.press(screen.getAllByLabelText('Zmazať skupinu')[0]);
    expect(alert).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([groups[1]]);
  });

  it('asks before deleting a group with ingredients and deletes only on confirm', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onChange = jest.fn();
    const groups: FormGroup[] = [
      { key: 'g1', name: 'Cesto', items: [item('múka'), item('vajce')] },
      { key: 'g2', name: '', items: [] },
    ];
    await render(<IngredientsEditor groups={groups} onChange={onChange} />);
    await fireEvent.press(screen.getAllByLabelText('Zmazať skupinu')[0]);

    expect(alert).toHaveBeenCalledWith('Zmazať skupinu', 'Zmazať skupinu aj so všetkými surovinami?', expect.any(Array));
    expect(onChange).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Zrušiť', 'cancel'],
      ['Zmazať', 'destructive'],
    ]);
    expect(buttons[0].onPress).toBeUndefined();

    await act(async () => {
      buttons[1].onPress!();
    });
    expect(onChange).toHaveBeenCalledWith([groups[1]]);
  });
});

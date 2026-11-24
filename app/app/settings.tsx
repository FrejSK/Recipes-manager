import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Task 16: "Záloha" section goes here, above Kategórie. */}
      <Pressable style={styles.row} onPress={() => router.push('/categories' as never)}>
        <Text>Kategórie</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
});

import React, { ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLayout } from '../hooks/useLayout';

type Props = {
  left: ReactNode;
  right: ReactNode;
};

export function SplitView({ left, right }: Props) {
  const { isTablet } = useLayout();

  if (isTablet) {
    return (
      <View style={styles.splitContainer}>
        <View style={styles.leftPanel}>{left}</View>
        <View style={styles.divider} />
        <View style={styles.rightPanel}>{right}</View>
      </View>
    );
  }

  // 아이폰: left만 표시 (right는 각 화면에서 모달로 처리)
  return <View style={styles.fullContainer}>{left}</View>;
}

const styles = StyleSheet.create({
  splitContainer: { flex: 1, flexDirection: 'row' },
  leftPanel: { width: '42%', borderRightWidth: 1, borderRightColor: '#e0e0e0' },
  divider: { width: 1, backgroundColor: '#e0e0e0' },
  rightPanel: { flex: 1 },
  fullContainer: { flex: 1 },
});

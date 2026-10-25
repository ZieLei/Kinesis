import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { Dimensions, Pressable } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { useColorScheme } from 'nativewind';

import { styledIcon } from '@/components/StyledIcon';

import HouseIcon from 'lucide-react-native/icons/house';
import DollarSignIcon from 'lucide-react-native/icons/dollar-sign';
import LayersIcon from 'lucide-react-native/icons/layers';
import ChartColumnIcon from 'lucide-react-native/icons/chart-column';
import WrenchIcon from 'lucide-react-native/icons/wrench';

const House = styledIcon(HouseIcon);
const DollarSign = styledIcon(DollarSignIcon);
const Layers = styledIcon(LayersIcon);
const ChartColumn = styledIcon(ChartColumnIcon);
const Wrench = styledIcon(WrenchIcon);

// TODO: Add back-system handling for the app.

const tabs = [
  {
    name: 'dashboard',
    href: '/dashboard',
    label: 'HOME',
    Icon: House,
  },
  {
    name: 'new-sale',
    href: '/new-sale',
    label: 'SALE',
    Icon: DollarSign,
  },
  {
    name: 'services',
    href: '/services',
    label: 'SERVICES',
    Icon: Wrench,
  },
  {
    name: 'stock',
    href: '/stock',
    label: 'STOCK',
    Icon: Layers,
  },
  {
    name: 'reports',
    href: '/reports',
    label: 'REPORTS',
    Icon: ChartColumn,
  },
] as const;

type Tab = (typeof tabs)[number];

type TabButtonProps = TabTriggerSlotProps & {
  tab: Tab;
  screenWidth: number;
  isDark: boolean;
};

function AnimatedTabContent({
  tab,
  isFocused,
  screenWidth,
  isDark,
  ...props
}: TabButtonProps) {
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(isFocused ? 1 : 0, {
      damping: 15,
      stiffness: 200,
    });
  }, [isFocused, progress]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + progress.value * 0.5,
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [
        isDark ? '#A6ADC8' : '#6C6F85', // Catppuccin subtext0
        isDark ? '#CDD6F4' : '#4C4F69', // Catppuccin text
      ],
    ),
  }));

  const { Icon } = tab;

  return (
    <Pressable
      {...props}
      style={{
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
      }}
      android_ripple={{ color: 'transparent' }}
    >
      <Animated.View style={iconStyle}>
        <Icon
          size={22}
          className={isFocused ? 'text-ctp-text' : 'text-ctp-subtext0'}
        />
      </Animated.View>

      <Animated.Text
        className="mt-2"
        style={[
          {
            fontSize: screenWidth * 0.03,
            fontWeight: isFocused ? '700' : '500',
          },
          textStyle,
        ]}
      >
        {tab.label}
      </Animated.Text>
    </Pressable>
  );
}

export default function TabLayout() {
  const { width: screenWidth } = Dimensions.get('window');
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Tabs>
        <TabSlot style={{ flex: 1 }} />

        <TabList
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 13,
            paddingBottom: 28,
            backgroundColor: isDark ? '#1E1E2E' : '#EFF1F5',
            borderTopWidth: 0,
            borderTopColor: 'transparent',
            elevation: 0,
            shadowOpacity: 0,
            shadowRadius: 0,
          }}
        >
          {tabs.map((tab) => (
            <TabTrigger
              key={tab.name}
              name={tab.name}
              href={tab.href}
              asChild
            >
              <AnimatedTabContent
                tab={tab}
                screenWidth={screenWidth}
                isDark={isDark}
              />
            </TabTrigger>
          ))}
        </TabList>
      </Tabs>
    </GestureHandlerRootView>
  );
}

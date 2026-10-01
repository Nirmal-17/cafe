declare module 'react-native-svg-charts' {
  import { Component } from 'react';
  import { ViewStyle } from 'react-native';

  interface PieChartProps {
    data: {
      key: string | number;
      value: number;
      svg?: {
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
        opacity?: number;
        [key: string]: any;
      };
      arc?: {
        innerRadius?: number;
        outerRadius?: number;
        cornerRadius?: number;
        padAngle?: number;
      };
      [key: string]: any;
    }[];
    innerRadius?: number;
    outerRadius?: number;
    padAngle?: number;
    animate?: boolean;
    animationDuration?: number;
    style?: ViewStyle;
    children?: React.ReactNode;
  }

  interface BarChartProps {
    data: {
      value: number;
      svg?: {
        fill?: string;
        stroke?: string;
        strokeWidth?: number;
        opacity?: number;
        rx?: number;
        ry?: number;
        [key: string]: any;
      };
      label?: string;
      frontColor?: string;
      [key: string]: any;
    }[];
    spacingInner?: number;
    spacingOuter?: number;
    animate?: boolean;
    animationDuration?: number;
    style?: ViewStyle;
    gridMin?: number;
    gridMax?: number;
    yAccessor?: (props: any) => number;
    xAccessor?: (props: any) => number;
    children?: React.ReactNode;
  }

  interface LineChartProps {
    data: number[];
    style?: ViewStyle;
    svg?: object;
    curve?: any;
    animate?: boolean;
    animationDuration?: number;
    gridMin?: number;
    gridMax?: number;
    children?: React.ReactNode;
  }

  interface ProgressChartProps {
    data: number[];
    style?: ViewStyle;
    svg?: object;
    innerRadius?: number;
    outerRadius?: number;
    animate?: boolean;
    animationDuration?: number;
    children?: React.ReactNode;
  }

  export class PieChart extends Component<PieChartProps> {}
  export class BarChart extends Component<BarChartProps> {}
  export class LineChart extends Component<LineChartProps> {}
  export class ProgressChart extends Component<ProgressChartProps> {}
}

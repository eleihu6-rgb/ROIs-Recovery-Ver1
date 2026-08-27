# PBS App 移动端开发规范

PBS 机组申请移动端 App。

## 技术栈

- React Native + Expo + TypeScript
- 样式：NativeWind（Tailwind CSS for React Native）
- 状态管理：Zustand
- 导航：React Navigation

## 目录结构

```
src/
├── components/          # 通用组件
├── screens/             # 页面屏幕
├── navigation/          # 导航配置
├── hooks/               # 自定义 hooks
├── stores/              # Zustand 状态管理
├── services/            # API 请求（axios，指向 pbs-server）
├── types/               # 类型定义
├── utils/               # 工具函数
└── App.tsx              # App 入口
```

## 特有规范

- 与 pbs-portal 共用同一个 pbs-server 后端
- 敏感数据（token）使用 expo-secure-store 存储，不用 AsyncStorage
- 样式尽量与 pbs-portal 保持一致（通过 NativeWind 实现 Tailwind 写法）
- 组件行为逻辑尽量与 pbs-portal 复用（通过 hooks 和 services 层共享）

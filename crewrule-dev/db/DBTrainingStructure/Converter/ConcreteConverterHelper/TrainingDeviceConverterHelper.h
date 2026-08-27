/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/8/21 16:59
 * @File:    TrainingDeviceConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGDEVICECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGDEVICECONVERTERHELPER_H

#include "ConverterHelper.h"

using TrainingDeviceConverterSourceType = std::shared_ptr<TmDevice>;

template<>
struct ConverterHelper<TrainingDeviceConverterSourceType, DBTrainingDevice> {
    static DBTrainingDevice *Convert(const TrainingDeviceConverterSourceType &src) {
        std::unordered_map<std::string, DBTrainingDevice::Type> deviceTypeMap{
                {"C",  DBTrainingDevice::Type::Classroom},
                {"E", DBTrainingDevice::Type::E_Learning},
                {"S", DBTrainingDevice::Type::Simulator}
        };
        auto id = src->id;
        auto name = src->resourceCode;
        auto groups = src->resourceTypes;
        auto deviceTypeStr = src->deviceType;
        auto deviceTypeIt = deviceTypeMap.find(deviceTypeStr);
        if (deviceTypeIt == deviceTypeMap.end()) return nullptr;
        auto deviceType = deviceTypeIt->second;
        auto location = src->port;
        unsigned int maximumCapacity =
                src->roomCapacity < 0 ? std::numeric_limits<unsigned int>::max() : src->roomCapacity;           //TODO: set maximumCapacity
        unsigned int designedCapacity =
                src->roomCapacity < 0 ? std::numeric_limits<unsigned int>::max() : src->roomCapacity;
        const auto effectiveStartTime = src->effectiveDateLoc;
        const auto effectiveEndTime = src->expirationDateLoc;

        return new DBTrainingDevice(id, name, groups, deviceType, location, maximumCapacity, designedCapacity, effectiveStartTime, effectiveEndTime);
    }
};

#endif //TRAININGOPTIMIZER_TRAININGDEVICECONVERTERHELPER_H

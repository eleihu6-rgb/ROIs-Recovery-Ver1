/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/9/9 9:41
 * @File:    TrainingDeviceOccupiedTimeConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGDEVICEOCCUPIEDTIMECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGDEVICEOCCUPIEDTIMECONVERTERHELPER_H

#include "ConverterHelper.h"
#include "UtilFunc.h"

using TrainingDeviceOccupiedTimeConverterSourceType = std::pair<std::shared_ptr<TmDeviceTime>, unordered_map<string, std::vector<std::shared_ptr<TmDevice>>>*>;

template<>
struct ConverterHelper<TrainingDeviceOccupiedTimeConverterSourceType, DBTrainingDeviceOccupiedTime> {
    static DBTrainingDeviceOccupiedTime *Convert(const TrainingDeviceOccupiedTimeConverterSourceType &src) {
        auto devicesIter = src.second->find(src.first->resourceCode);
        if (devicesIter == src.second->end() || devicesIter->second.empty())
            return nullptr;
        string status = src.first->status;//取值：N：不可用，U_O:手动占用 U_F:SIM航班占用 U_R:排班占用， ALL或空: 可用
        string fullStartTime = src.first->startDate + " " + src.first->startTime + ":00";
        string fullEndTime = src.first->endDate + " " + src.first->endTime + ":00";
        auto startTimeLoc = utcStrToUtc(const_cast<char *>(fullStartTime.c_str()));
        auto endTimeLoc = utcStrToUtc(const_cast<char *>(fullEndTime.c_str()));
        std::shared_ptr<TmDevice> device = nullptr;
        for (const auto &deviceTemp: devicesIter->second) {
            if (src.first->startTimeLoc < deviceTemp->expirationDateLoc && src.first->endTimeLoc > deviceTemp->effectiveDateLoc) {
                device = deviceTemp;
                break;
            }
        }
        auto result =  new DBTrainingDeviceOccupiedTime(device->id, startTimeLoc, endTimeLoc, device->roomCapacity, status);
        result->SetStartTimeUtc(src.first->startTimeUtc);
        result->SetEndTimeUtc(src.first->endTimeUtc);
        result->SetStartTimeLoc(src.first->startTimeLoc);
        result->SetEndTimeLoc(src.first->endTimeLoc);
        result->SetCourseCodes(std::unordered_set<std::string>(src.first->courseCodeList.begin(), src.first->courseCodeList.end()));
        result->SetFootprintNames(std::unordered_set<std::string>(src.first->footprintNameList.begin(), src.first->footprintNameList.end()));
        return result;
    }
};

#endif //TRAININGOPTIMIZER_TRAININGDEVICEOCCUPIEDTIMECONVERTERHELPER_H

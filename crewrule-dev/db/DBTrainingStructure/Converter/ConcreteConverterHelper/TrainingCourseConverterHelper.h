//
// Created by haoli on 2025/8/18.
//

#ifndef TRAININGOPTIMIZER_TRAININGCOURSECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGCOURSECONVERTERHELPER_H

#include "algorithm"
#include "ConverterHelper.h"
#include "DBTrainingCourse.h"

using TrainingCourseConverterSourceType = std::shared_ptr<TmCourse>;

template<>
struct ConverterHelper<TrainingCourseConverterSourceType, DBTrainingCourse> {
    static DBTrainingCourse *Convert(const TrainingCourseConverterSourceType &src) {
        std::unordered_map<std::string, DBTrainingCourse::Type> courseTypeMap{
                {"SIM",        DBTrainingCourse::Type::Simulator},
                {"GROUND",     DBTrainingCourse::Type::Ground},
                {"LINE",       DBTrainingCourse::Type::Line},
                {"E-LEARNING", DBTrainingCourse::Type::E_Learning}
        };
        std::unordered_map<std::string, DBTrainingDevice::Type> deviceTypeMap{
                {"C", DBTrainingDevice::Type::Classroom},
                {"S", DBTrainingDevice::Type::Simulator},
                {"E", DBTrainingDevice::Type::E_Learning}
        };
        long long id = src->id;
        std::string name = src->courseCode;
        auto typeIt = courseTypeMap.find(src->courseType);
        if (typeIt == courseTypeMap.end()) return nullptr;
        DBTrainingCourse::Type type = typeIt->second;
        unsigned int sector = src->sector < 0 ? 0 : src->sector;                //TODO: set sector
        auto dbTrainingCourse = new DBTrainingCourse(id, name, type, sector);
        std::vector<time_t> startTimes(src->startTimeMinutes.begin(), src->startTimeMinutes.end());
        std::for_each(startTimes.begin(), startTimes.end(), [](auto &time) {
            time *= 60;         // minutes -> seconds
        });
        if (src->startTimeOption == "MUST") {
            dbTrainingCourse->SetMustStartTimes(startTimes);
        } else {
            dbTrainingCourse->SetSuggestStartTimes(startTimes);
        }
        std::unordered_set<std::string> devices(src->deviceGroups.begin(), src->deviceGroups.end());
        if (src->deviceOption == "MUST") {
            dbTrainingCourse->SetMustDevices(devices);
        } else {
            dbTrainingCourse->SetSuggestDevices(devices);
        }
        auto deviceTypeIt = deviceTypeMap.find(src->deviceType);
        if (deviceTypeIt != deviceTypeMap.end())
            dbTrainingCourse->SetDeviceType(deviceTypeIt->second);
        std::set<std::string> projectQuals(src->projectQuals.begin(), src->projectQuals.end());
        dbTrainingCourse->SetProjectQuals(projectQuals);
        return dbTrainingCourse;
    }
};

#endif //TRAININGOPTIMIZER_TRAININGCOURSECONVERTERHELPER_H

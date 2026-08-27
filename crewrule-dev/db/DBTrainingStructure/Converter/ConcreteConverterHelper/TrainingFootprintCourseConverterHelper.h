/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/1/17 14:15
 * @File:    TrainingCourseFootprintConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGCOURSEFOOTPRINTCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGCOURSEFOOTPRINTCONVERTERHELPER_H
#include "algorithm"
#include "ConverterHelper.h"
#include "DBTrainingFootprintCourse.h"
#include "TmFootprintIndex.h"

using TrainingFootprintCourseConverterSourceType = std::pair<std::shared_ptr<TmFootprintCourse>, std::shared_ptr<TmFootprintIndex>>;

template<>
struct ConverterHelper<TrainingFootprintCourseConverterSourceType, DBTrainingFootprintCourse> {
    static DBTrainingFootprintCourse *Convert(const TrainingFootprintCourseConverterSourceType &src) {
        auto &[courseFootprint, footprintIndex] = src;
        auto id = courseFootprint->id;
        auto courseId = courseFootprint->courseId;
        auto footprintId = courseFootprint->footprintId;
        std::unordered_set<std::string> fleets;
        auto footprint = footprintIndex->getById(footprintId);
        std::string name;
        if (footprint) {
            auto fleetVec = footprint->crewFleets;
            fleets.insert(fleetVec.begin(), fleetVec.end());
            name = footprint->name;
        }
        const auto duration = courseFootprint->duration;
        const auto durationUnit = courseFootprint->unit;
        long long durationSecond{0};
        int sectorNumber{0};
        if (durationUnit == "H") {
            // convert to second
            durationSecond = duration * 3600;
        } else if (durationUnit == "M") {
            // convert to second
            durationSecond = duration * 60;
        } else if (durationUnit == "Leg") {
            sectorNumber = duration;
        }
        auto dbTrainingCourseFootprint = new DBTrainingFootprintCourse(id, courseId, footprintId, name, fleets, durationSecond, sectorNumber);
        return dbTrainingCourseFootprint;
    }
};
#endif //TRAININGOPTIMIZER_TRAININGCOURSEFOOTPRINTCONVERTERHELPER_H

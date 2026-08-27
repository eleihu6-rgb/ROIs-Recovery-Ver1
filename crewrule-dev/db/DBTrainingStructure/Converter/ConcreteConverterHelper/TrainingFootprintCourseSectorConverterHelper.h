/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/3/27 16:28
 * @File:    TrainingFootprintCourseSectorConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSESECTORCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSESECTORCONVERTERHELPER_H
#include "ConverterHelper.h"
#include "DBTrainingFootprintCourseSector.h"
#include "TmFootprintIndex.h"

using TrainingFootprintCourseSectorConverterSourceType = std::shared_ptr<TmFootprintCourseSector>;

template<>
struct ConverterHelper<TrainingFootprintCourseSectorConverterSourceType, DBTrainingFootprintCourseSector> {
    static DBTrainingFootprintCourseSector *Convert(const TrainingFootprintCourseSectorConverterSourceType &src) {
        const std::unordered_set<std::string> airports(src->airports.begin(), src->airports.end());
        auto dbTrainingFootprintCourseSector = new DBTrainingFootprintCourseSector(
            src->id, src->footprintCourseId, src->sector, airports);
        return dbTrainingFootprintCourseSector;
    }
};
#endif //TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSESECTORCONVERTERHELPER_H

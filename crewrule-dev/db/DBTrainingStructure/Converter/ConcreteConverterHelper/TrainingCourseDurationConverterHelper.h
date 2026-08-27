/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/1/13 16:45
 * @File:    TrainingCourseDurationConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGCOURSEDURATIONCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGCOURSEDURATIONCONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingCourseTime.h"

using TrainingCourseDurationConverterSourceType = std::shared_ptr<TmCourseDuration>;

template<>
struct ConverterHelper<TrainingCourseDurationConverterSourceType, DBTrainingCourseDuration> {
    static DBTrainingCourseDuration *Convert(const TrainingCourseDurationConverterSourceType &src) {
        long long id = src->id;
        long long courseId = src->courseId;
        int num = src->num;
        long long duration = (long long) src->duration * 60;         // minutes -> seconds
        return new DBTrainingCourseDuration(id, courseId, num, duration);
    }
};

#endif //TRAININGOPTIMIZER_TRAININGCOURSEDURATIONCONVERTERHELPER_H

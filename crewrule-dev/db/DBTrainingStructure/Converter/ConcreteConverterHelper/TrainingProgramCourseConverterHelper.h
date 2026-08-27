/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/8/21 16:41
 * @File:    TrainingProgramCourseConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGPROGRAMCOURSECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGPROGRAMCOURSECONVERTERHELPER_H

#include "ConverterHelper.h"
#include "TmProgramIndex.h"

using TrainingProgramCourseConverterSourceType = std::pair<std::shared_ptr<TmProgramCourse>, std::shared_ptr<TmProgramCoursePnrIndex>>;

template<>
struct ConverterHelper<TrainingProgramCourseConverterSourceType, DBTrainingProgramCourse> {
    static DBTrainingProgramCourse *Convert(const TrainingProgramCourseConverterSourceType &src) {
        auto &[programCourse, programCoursePnrIndex] = src;
        auto id = programCourse->id;
        auto programId = programCourse->programId;
        auto courseId = programCourse->courseId;
        auto validPeriodStart = programCourse->startTime;
        auto validPeriodEnd = programCourse->endTime;
        auto sequence = programCourse->courseSortSeq;
        auto parentId = programCourse->parentId;
        long long pairingChartId{0};
        if (programCoursePnrIndex != nullptr) {
            auto programCoursePnr = programCoursePnrIndex->getByProgramCourseId(id);
            if (programCoursePnr != nullptr) {
                pairingChartId = programCoursePnr->tmPairingChartId;
            }
        }

        return new DBTrainingProgramCourse(id, programId, courseId, validPeriodStart, validPeriodEnd, sequence,
                                           parentId, pairingChartId);
    }
};

#endif //TRAININGOPTIMIZER_TRAININGPROGRAMCOURSECONVERTERHELPER_H

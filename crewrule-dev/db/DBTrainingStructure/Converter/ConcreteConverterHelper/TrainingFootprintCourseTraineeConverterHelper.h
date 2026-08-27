#ifndef TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSETRAINEECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSETRAINEECONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingFootprintCourseTrainee.h"
#include "CrewDB.h"

using TrainingFootprintCourseTraineeConverterSourceType = std::shared_ptr<TmFootprintCourseTrainee>;

template<>
struct ConverterHelper<TrainingFootprintCourseTraineeConverterSourceType, DBTrainingFootprintCourseTrainee> {
    static DBTrainingFootprintCourseTrainee *Convert(const TrainingFootprintCourseTraineeConverterSourceType &src) {
        if (!src) {
            return nullptr;
        }
        long long durationSeconds = 0;
        const auto duration = src->duration;
        const auto &durationUnit = src->unit;
        if (durationUnit == "H") {
            durationSeconds = static_cast<long long>(duration * 3600);
        } else if (durationUnit == "M") {
            durationSeconds = static_cast<long long>(duration * 60);
        } else if (durationUnit == "LEG") {
            durationSeconds = 0;
        }
        return new DBTrainingFootprintCourseTrainee(
                src->id, src->footprintId, src->footprintCourseId, durationSeconds,
                src->startTimeOption, src->startTimeMinutes, src->timePeriodOption,
                src->timePeriodStartMinutes, src->timePeriodEndMinutes);
    }
};

#endif

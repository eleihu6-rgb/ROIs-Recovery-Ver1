/**
 * @Author:  Codex
 * @Time:    2026/4/10
**/

#ifndef TRAININGOPTIMIZER_TRAININGPAIRINGCHARTCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGPAIRINGCHARTCONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingPairingChart.h"

using TrainingPairingChartConverterSourceType = std::shared_ptr<TmPairingChart>;

template<>
struct ConverterHelper<TrainingPairingChartConverterSourceType, DBTrainingPairingChart> {
    static DBTrainingPairingChart *Convert(const TrainingPairingChartConverterSourceType &src) {
        return new DBTrainingPairingChart(src->id, src->buddyNumber, src->effDt, src->expDt, src->teRanks,
                                          src->allBuddyRanks, src->durationMinutes);
    }
};

#endif //TRAININGOPTIMIZER_TRAININGPAIRINGCHARTCONVERTERHELPER_H

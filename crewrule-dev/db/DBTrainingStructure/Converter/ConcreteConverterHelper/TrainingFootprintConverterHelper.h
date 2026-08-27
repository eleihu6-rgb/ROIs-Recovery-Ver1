/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/3/29 16:15
 * @File:    TrainingFootprintConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGFOOTPRINTCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGFOOTPRINTCONVERTERHELPER_H
#include "ConverterHelper.h"
#include "DBTrainingFootprint.h"
#include "TmFootprintIndex.h"

using TrainingFootprintConverterSourceType = std::shared_ptr<TmFootprint>;

template<>
struct ConverterHelper<TrainingFootprintConverterSourceType, DBTrainingFootprint> {
    static DBTrainingFootprint *Convert(const TrainingFootprintConverterSourceType &src) {
        auto dbTrainingFootprint = new DBTrainingFootprint(src->id);
        return dbTrainingFootprint;
    }
};
#endif //TRAININGOPTIMIZER_TRAININGFOOTPRINTCONVERTERHELPER_H

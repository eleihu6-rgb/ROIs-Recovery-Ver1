/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/8/21 16:23
 * @File:    TrainingProgramConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGPROGRAMCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGPROGRAMCONVERTERHELPER_H

#include "ConverterHelper.h"
#include "unordered_map"

using TrainingProgramConverterSourceType = std::shared_ptr<TmProgram>;

template<>
struct ConverterHelper<TrainingProgramConverterSourceType, DBTrainingProgram> {
    static DBTrainingProgram *Convert(const TrainingProgramConverterSourceType &src) {
        std::unordered_map<std::string, DBTrainingProgram::Status> statusMap{
                {"NOT SCHEDULED", DBTrainingProgram::Status::Not_Scheduled},
                {"PARTIAL SCHEDULED", DBTrainingProgram::Status::Partial_Scheduled},
                {"COMPLETED", DBTrainingProgram::Status::Completed},
                {"SCHEDULED", DBTrainingProgram::Status::Scheduled},
                {"MANUAL END", DBTrainingProgram::Status::Manual_End}
        };
        auto id = src->id;
        auto footprintId = src->footprintId;
        auto name = src->name;
        auto crewId = src->crewId;
        auto startDate = src->startDate;
        auto endDate = src->endDate;
        auto status = DBTrainingProgram::Status::Not_Scheduled;
        auto statusIt = statusMap.find(src->status);
        if (statusIt != statusMap.end())
            status = statusIt->second;
        return new DBTrainingProgram(id, name, crewId, startDate, endDate, status, footprintId);
    }
};

#endif //TRAININGOPTIMIZER_TRAININGPROGRAMCONVERTERHELPER_H

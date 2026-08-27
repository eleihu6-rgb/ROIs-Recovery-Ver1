/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2025/9/3 17:07
 * @File:    TrainingProgramCourseParticipant.h
 * @Version: 1.0.0
 * @Copyright (c) 2025 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEPARTICIPANTCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEPARTICIPANTCONVERTERHELPER_H
#include "ConverterHelper.h"

using TrainingProgramCourseParticipantConverterSourceType = std::pair<std::shared_ptr<TmProgramCourse>, std::shared_ptr<CrewDataContext>>;

template<>
struct ConverterHelper<TrainingProgramCourseParticipantConverterSourceType, DBTrainingProgramCourseParticipant> {
    static DBTrainingProgramCourseParticipant *Convert(const TrainingProgramCourseParticipantConverterSourceType &src) {
        std::unordered_map<std::string, DBTrainingCourseRoleRequirement::RoleType> roleTypeMap{
            {"TE", DBTrainingCourseRoleRequirement::RoleType::Trainee},
            {"IP", DBTrainingCourseRoleRequirement::RoleType::Instructor},
            {"CK", DBTrainingCourseRoleRequirement::RoleType::Checker},
            {"PNR", DBTrainingCourseRoleRequirement::RoleType::Partner},
            {"SP", DBTrainingCourseRoleRequirement::RoleType::SafetyPilot},
            {"XIP", DBTrainingCourseRoleRequirement::RoleType::ExtraInstructor},
            {"STD", DBTrainingCourseRoleRequirement::RoleType::Standardization},
            {"OIP", DBTrainingCourseRoleRequirement::RoleType::ObserveIP},
            {"PBN", DBTrainingCourseRoleRequirement::RoleType::ProbationIP},
            {"TE_OBS", DBTrainingCourseRoleRequirement::RoleType::ObserveTrainee}
        };
        auto &[tmProgramCourseInstructor, dbData] = src;
        auto programCourseId = tmProgramCourseInstructor->id;
        auto roleTypeStr = tmProgramCourseInstructor->role;
        auto roleTypeIt = roleTypeMap.find(roleTypeStr);
        if (roleTypeIt == roleTypeMap.end()) return nullptr;
        auto roleType = roleTypeIt->second;
        auto crewId = tmProgramCourseInstructor->crewId;
        auto rosterId = tmProgramCourseInstructor->rosterId;
        auto rosterGroundId = tmProgramCourseInstructor->rosterGroundId;
        size_t sector = 0;
        long long scenarioId = dbData->scenarioId;
        return new DBTrainingProgramCourseParticipant(programCourseId, roleType, crewId, rosterId, rosterGroundId, sector, scenarioId);
    }
};

#endif //TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEPARTICIPANTCONVERTERHELPER_H

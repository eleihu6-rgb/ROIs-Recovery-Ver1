/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/1/12 17:48
 * @File:    TrainingProgramCourseInstructorParticipantConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEINSTRUCTORPARTICIPANTCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEINSTRUCTORPARTICIPANTCONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingProgramCourseInstructorParticipant.h"
#include "TmProgramIndex.h"

using TrainingProgramCourseInstructorParticipantConverterSourceType = std::pair<std::shared_ptr<TmProgramCourseInstructor>, std::shared_ptr<CrewDataContext>>;

template<>
struct ConverterHelper<TrainingProgramCourseInstructorParticipantConverterSourceType, DBTrainingProgramCourseInstructorParticipant> {
    static DBTrainingProgramCourseInstructorParticipant *
    Convert(const TrainingProgramCourseInstructorParticipantConverterSourceType &src) {
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
        auto programCourseInstructorId = tmProgramCourseInstructor->id;
        auto roleTypeStr = tmProgramCourseInstructor->role;
        auto roleTypeIt = roleTypeMap.find(roleTypeStr);
        if (roleTypeIt == roleTypeMap.end()) return nullptr;
        auto roleType = roleTypeIt->second;
        auto crewId = tmProgramCourseInstructor->crewId;
        auto rosterId = tmProgramCourseInstructor->rosterId;
        auto rosterGroundId = tmProgramCourseInstructor->rosterGroundId;
        long long scenarioId = dbData->scenarioId;
        auto programCourses = dbData->tmProgramCourseIndex->getByGroupId(tmProgramCourseInstructor->groupId);
        std::vector<long long> programCourseIds;
        programCourseIds.reserve(programCourses.size());
        for (auto &programCourse: programCourses) {
            programCourseIds.emplace_back(programCourse->id);
        }
        return new DBTrainingProgramCourseInstructorParticipant(programCourseInstructorId, programCourseIds, roleType,
                                                                crewId, rosterId, rosterGroundId, scenarioId);
    }
};

#endif //TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEINSTRUCTORPARTICIPANTCONVERTERHELPER_H

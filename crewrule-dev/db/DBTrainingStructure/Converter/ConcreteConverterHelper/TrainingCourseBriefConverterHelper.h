/**
 * @Author:  Haoli Chen
 * @E-mail:  haoli.chen@pi-solution.com
 * @Time:    2026/1/13 16:50
 * @File:    TrainingCourseBriefConverterHelper.h
 * @Version: 1.0.0
 * @Copyright (c) 2026 Pi-solution. All rights reserved.
**/


#ifndef TRAININGOPTIMIZER_TRAININGCOURSEBRIEFCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGCOURSEBRIEFCONVERTERHELPER_H
#include "ConverterHelper.h"
#include "DBTrainingCourseTime.h"

using TrainingCourseBriefConverterSourceType = std::shared_ptr<TmCourseBrief>;

template<>
struct ConverterHelper<TrainingCourseBriefConverterSourceType, DBTrainingCourseBrief> {
    static DBTrainingCourseBrief *Convert(const TrainingCourseBriefConverterSourceType &src) {
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
        // 1-brief，2-debrief
        std::unordered_map<int, DBTrainingCourseBrief::BriefType> briefTypeMap{
                {1,  DBTrainingCourseBrief::BriefType::Brief},
                {2,  DBTrainingCourseBrief::BriefType::Debrief}
        };
        auto briefTypeIt = briefTypeMap.find(src->briefType);
        if (briefTypeIt == briefTypeMap.end()) return nullptr;
        auto type = briefTypeIt->second;
        long long id = src->id;
        long long courseId = src->courseId;
        std::vector<DBTrainingCourseRoleRequirement::RoleType> roles;
        roles.reserve(src->briefRoles.size());
        for(auto &roleStr:src->briefRoles){
            auto roleTypeIt = roleTypeMap.find(roleStr);
            if (roleTypeIt == roleTypeMap.end()) continue;
            roles.emplace_back(roleTypeIt->second);
        }
        long long time = (long long) src->briefTimes * 60;         // minutes -> seconds
        return new DBTrainingCourseBrief(id, courseId, roles, type, time);
    }
};
#endif //TRAININGOPTIMIZER_TRAININGCOURSEBRIEFCONVERTERHELPER_H

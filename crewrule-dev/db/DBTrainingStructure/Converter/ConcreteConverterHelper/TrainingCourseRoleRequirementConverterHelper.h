//
// Created by haoli on 2025/8/20.
//

#ifndef TRAININGOPTIMIZER_TRAININGCOURSEROLEREQUIREMENTCONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGCOURSEROLEREQUIREMENTCONVERTERHELPER_H

#include "ConverterHelper.h"
#include "TmCourseIndex.h"

using TrainingCourseRoleRequirementConverterSourceType = std::tuple<std::shared_ptr<TmCourseRole>, std::shared_ptr<TmCourseRoleBaseIndex>, std::shared_ptr<TmCourseRoleQualIndex>>;

template<>
struct ConverterHelper<TrainingCourseRoleRequirementConverterSourceType, DBTrainingCourseRoleRequirement> {
    static DBTrainingCourseRoleRequirement *Convert(const TrainingCourseRoleRequirementConverterSourceType &src) {
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
        const auto &[tmCourseRole, tmCourseRoleBaseIndex, tmCourseRoleQualIndex] = src;
        auto courseId = tmCourseRole->courseId;
        auto roleTypeStr = tmCourseRole->role;
        auto roleTypeIt = roleTypeMap.find(roleTypeStr);
        if (roleTypeIt == roleTypeMap.end()) return nullptr;
        auto roleType = roleTypeIt->second;
        auto roleBases = tmCourseRoleBaseIndex->getByCourseRoleId(tmCourseRole->id);
        bool countForOperating{true};                           //TODO:set countForOperating
        unsigned int lowerRange = tmCourseRole->minCapacity < 0 ? 0 : tmCourseRole->minCapacity;
        unsigned int upperRange =
                tmCourseRole->maxCapacity < 0 ? std::numeric_limits<unsigned int>::max() : tmCourseRole->maxCapacity;
        // TODO: cannot support for complex logic
        std::vector<DBTrainingCourseRoleRequirement::RoleRequirement> roleRequirements;
        for (const auto &roleBase: roleBases) {
            auto roleQuals = tmCourseRoleQualIndex->getByCourseRoleBaseId(roleBase->id);
            std::unordered_set<std::string> bases(roleBase->bases.begin(), roleBase->bases.end());
            std::unordered_set<std::string> ranks(roleBase->ranks.begin(), roleBase->ranks.end());
            std::unordered_set<std::string> fleets(roleBase->fleets.begin(), roleBase->fleets.end());
            std::unordered_set<std::string> teams(roleBase->teams.begin(), roleBase->teams.end());
            std::unordered_set<std::string> actingRanks(roleBase->actingRanks.begin(), roleBase->actingRanks.end());
            if (actingRanks.empty()) actingRanks.emplace("*");
            // hardcode: if any one is satisfied, the condition is met
            std::pair<std::unordered_set<std::string>, bool> basesPair{bases, true};
            std::pair<std::unordered_set<std::string>, bool> ranksPair{ranks, true};
            std::pair<std::unordered_set<std::string>, bool> fleetsPair{fleets, true};
            std::pair<std::unordered_set<std::string>, bool> teamsPair{teams, true};
            auto operating = roleBase->operating;
            countForOperating = operating;
            for (const auto &roleQual: roleQuals) {
                std::unordered_set<std::string> quals(roleQual->quals.begin(), roleQual->quals.end());
                std::pair<std::unordered_set<std::string>, bool> qualsPair{quals, true};
                unsigned int limitation = roleQual->peopleLimit < 0 ? 0 : roleQual->peopleLimit;
                if (roleQual->condition == "AND") {
                    qualsPair.second = false;
                }
                DBTrainingCourseRoleRequirement::RoleRequirement roleRequirement(basesPair, ranksPair, fleetsPair,
                                                                                 teamsPair, qualsPair, actingRanks, limitation, operating);
                roleRequirements.emplace_back(roleRequirement);
            }
        }
        return new DBTrainingCourseRoleRequirement(courseId, roleType, std::move(roleRequirements), countForOperating,
                                                   lowerRange, upperRange);
    }
};

#endif //TRAININGOPTIMIZER_TRAININGCOURSEROLEREQUIREMENTCONVERTERHELPER_H

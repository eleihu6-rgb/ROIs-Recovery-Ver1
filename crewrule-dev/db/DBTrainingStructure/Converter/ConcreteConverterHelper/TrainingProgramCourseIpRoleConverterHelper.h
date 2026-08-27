#ifndef TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEIPROLECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEIPROLECONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingProgramCourseIpRole.h"
#include "DBTrainingProgramCourseIpRoleBase.h"
#include "DBTrainingProgramCourseIpRoleQual.h"
#include "TmProgramIndex.h"

#include <memory>
#include <tuple>

using TrainingProgramCourseIpRoleConverterSourceType =
        std::tuple<std::shared_ptr<TmProgramCourseIpRole>, std::shared_ptr<TmProgramCourseIpRoleBaseIndex>,
                   std::shared_ptr<TmProgramCourseIpRoleQualIndex>>;

template<>
struct ConverterHelper<TrainingProgramCourseIpRoleConverterSourceType, DBTrainingProgramCourseIpRole> {
    static DBTrainingProgramCourseIpRole *Convert(const TrainingProgramCourseIpRoleConverterSourceType &src) {
        const auto &[tmProgramCourseIpRole, tmProgramCourseIpRoleBaseIndex, tmProgramCourseIpRoleQualIndex] = src;
        if (!tmProgramCourseIpRole) {
            return nullptr;
        }
        std::vector<std::unique_ptr<DBTrainingProgramCourseIpRoleBase>> roleBases;
        auto roleBaseRows = tmProgramCourseIpRoleBaseIndex->getByProgramCourseIpRoleId(tmProgramCourseIpRole->id);
        roleBases.reserve(roleBaseRows.size());
        for (const auto &roleBase: roleBaseRows) {
            if (!roleBase) {
                continue;
            }
            std::vector<std::unique_ptr<DBTrainingProgramCourseIpRoleQual>> roleQuals;
            auto qualRows = tmProgramCourseIpRoleQualIndex->getByProgramCourseIpRoleBaseId(roleBase->id);
            roleQuals.reserve(qualRows.size());
            for (const auto &roleQual: qualRows) {
                if (!roleQual) {
                    continue;
                }
                roleQuals.emplace_back(std::make_unique<DBTrainingProgramCourseIpRoleQual>(
                        roleQual->id, roleQual->programId, roleQual->programCourseId,
                        roleQual->programCourseIpRoleId, roleQual->programCourseIpRoleBaseId,
                        std::vector<std::string>(roleQual->roleQuals.begin(), roleQual->roleQuals.end()),
                        roleQual->roleQualOption, roleQual->roleNumber));
            }
            roleBases.emplace_back(std::make_unique<DBTrainingProgramCourseIpRoleBase>(
                    roleBase->id, roleBase->programId, roleBase->programCourseId,
                    roleBase->programCourseIpRoleId,
                    std::vector<std::string>(roleBase->fleets.begin(), roleBase->fleets.end()),
                    std::vector<std::string>(roleBase->teams.begin(), roleBase->teams.end()),
                    std::vector<std::string>(roleBase->actingRanks.begin(), roleBase->actingRanks.end()),
                    std::move(roleQuals)));
        }
        return new DBTrainingProgramCourseIpRole(tmProgramCourseIpRole->id, tmProgramCourseIpRole->programId,
                                                tmProgramCourseIpRole->programCourseId, tmProgramCourseIpRole->programCoursePnrId,
                                                std::vector<std::string>(tmProgramCourseIpRole->bases.begin(), tmProgramCourseIpRole->bases.end()),
                                                std::vector<std::string>(tmProgramCourseIpRole->ranks.begin(), tmProgramCourseIpRole->ranks.end()),
                                                std::move(roleBases));
    }
};

#endif

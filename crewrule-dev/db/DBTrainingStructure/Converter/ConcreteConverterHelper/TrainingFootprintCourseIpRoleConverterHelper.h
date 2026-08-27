#ifndef TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSEIPROLECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSEIPROLECONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingFootprintCourseIpRole.h"
#include "DBTrainingFootprintCourseIpRoleBase.h"
#include "DBTrainingFootprintCourseIpRoleQual.h"
#include "TmFootprintIndex.h"

#include <memory>
#include <tuple>

using TrainingFootprintCourseIpRoleConverterSourceType =
        std::tuple<std::shared_ptr<TmFootprintCourseIpRole>, std::shared_ptr<TmFootprintCourseIpRoleBaseIndex>,
                   std::shared_ptr<TmFootprintCourseIpRoleQualIndex>>;

template<>
struct ConverterHelper<TrainingFootprintCourseIpRoleConverterSourceType, DBTrainingFootprintCourseIpRole> {
    static DBTrainingFootprintCourseIpRole *Convert(const TrainingFootprintCourseIpRoleConverterSourceType &src) {
        const auto &[tmFootprintCourseIpRole, tmFootprintCourseIpRoleBaseIndex, tmFootprintCourseIpRoleQualIndex] = src;
        if (!tmFootprintCourseIpRole) {
            return nullptr;
        }
        std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRoleBase>> roleBases;
        auto roleBaseRows = tmFootprintCourseIpRoleBaseIndex->getByFootprintCourseIpRoleId(tmFootprintCourseIpRole->id);
        roleBases.reserve(roleBaseRows.size());
        for (const auto &roleBase: roleBaseRows) {
            if (!roleBase) {
                continue;
            }
            std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRoleQual>> roleQuals;
            auto qualRows = tmFootprintCourseIpRoleQualIndex->getByFootprintCourseIpRoleBaseId(roleBase->id);
            roleQuals.reserve(qualRows.size());
            for (const auto &roleQual: qualRows) {
                if (!roleQual) {
                    continue;
                }
                roleQuals.emplace_back(std::make_unique<DBTrainingFootprintCourseIpRoleQual>(
                        roleQual->id, roleQual->footprintId, roleQual->footprintCourseId,
                        roleQual->footprintCourseIpRoleId, roleQual->footprintCourseIpRoleBaseId,
                        std::vector<std::string>(roleQual->roleQuals.begin(), roleQual->roleQuals.end()),
                        roleQual->roleQualOption, roleQual->roleNumber));
            }
            roleBases.emplace_back(std::make_unique<DBTrainingFootprintCourseIpRoleBase>(
                    roleBase->id, roleBase->footprintId, roleBase->footprintCourseId,
                    roleBase->footprintCourseIpRoleId,
                    std::vector<std::string>(roleBase->fleets.begin(), roleBase->fleets.end()),
                    std::vector<std::string>(roleBase->teams.begin(), roleBase->teams.end()),
                    std::vector<std::string>(roleBase->actingRanks.begin(), roleBase->actingRanks.end()),
                    std::move(roleQuals)));
        }
        return new DBTrainingFootprintCourseIpRole(tmFootprintCourseIpRole->id, tmFootprintCourseIpRole->footprintId,
                                                  tmFootprintCourseIpRole->footprintCourseId,
                                                  tmFootprintCourseIpRole->footprintTraineeId,
                                                  std::vector<std::string>(tmFootprintCourseIpRole->bases.begin(), tmFootprintCourseIpRole->bases.end()),
                                                  std::vector<std::string>(tmFootprintCourseIpRole->ranks.begin(), tmFootprintCourseIpRole->ranks.end()),
                                                  std::move(roleBases));
    }
};

#endif

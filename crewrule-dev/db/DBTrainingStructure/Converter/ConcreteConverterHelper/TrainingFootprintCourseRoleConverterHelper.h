#ifndef TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSEROLECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGFOOTPRINTCOURSEROLECONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingFootprintCourseRole.h"
#include "DBTrainingFootprintCourseRoleBase.h"
#include "DBTrainingFootprintCourseRoleQual.h"
#include "TmFootprintIndex.h"

#include <memory>
#include <tuple>

using TrainingFootprintCourseRoleConverterSourceType =
        std::tuple<std::shared_ptr<TmFootprintCourseRole>, std::shared_ptr<TmFootprintCourseRoleQualIndex>>;

template<>
struct ConverterHelper<TrainingFootprintCourseRoleConverterSourceType, DBTrainingFootprintCourseRole> {
    static DBTrainingFootprintCourseRole *Convert(const TrainingFootprintCourseRoleConverterSourceType &src) {
        const auto &[tmFootprintCourseRole, tmFootprintCourseRoleQualIndex] = src;
        if (!tmFootprintCourseRole || tmFootprintCourseRole->roleType == "IP") {
            return nullptr;
        }

        auto qualRows = tmFootprintCourseRoleQualIndex->getByFootprintCourseRoleId(tmFootprintCourseRole->id);
        std::vector<std::unique_ptr<DBTrainingFootprintCourseRoleQual>> roleQuals;
        roleQuals.reserve(qualRows.size());
        for (const auto &roleQual: qualRows) {
            if (!roleQual) {
                continue;
            }
            roleQuals.emplace_back(std::make_unique<DBTrainingFootprintCourseRoleQual>(
                    roleQual->id, roleQual->footprintCourseRoleId, tmFootprintCourseRole->id,
                    std::vector<std::string>(roleQual->roleQuals.begin(), roleQual->roleQuals.end()),
                    roleQual->roleQualOption, roleQual->roleNumber));
        }

        auto roleBase = std::make_unique<DBTrainingFootprintCourseRoleBase>(
                tmFootprintCourseRole->id, tmFootprintCourseRole->id,
                std::vector<std::string>(tmFootprintCourseRole->bases.begin(), tmFootprintCourseRole->bases.end()),
                std::vector<std::string>(tmFootprintCourseRole->ranks.begin(), tmFootprintCourseRole->ranks.end()),
                std::vector<std::string>(tmFootprintCourseRole->fleets.begin(), tmFootprintCourseRole->fleets.end()),
                std::vector<std::string>(tmFootprintCourseRole->teams.begin(), tmFootprintCourseRole->teams.end()),
                std::vector<std::string>(tmFootprintCourseRole->actingRanks.begin(), tmFootprintCourseRole->actingRanks.end()),
                std::move(roleQuals));

        std::vector<std::unique_ptr<DBTrainingFootprintCourseRoleBase>> roleBases;
        roleBases.emplace_back(std::move(roleBase));

        return new DBTrainingFootprintCourseRole(tmFootprintCourseRole->id, tmFootprintCourseRole->footprintId,
                                                 tmFootprintCourseRole->footprintCourseId,
                                                 tmFootprintCourseRole->footprintTraineeId,
                                                 tmFootprintCourseRole->role, tmFootprintCourseRole->roleNumber,
                                                 std::move(roleBases));
    }
};

#endif

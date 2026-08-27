#ifndef TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEROLECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGPROGRAMCOURSEROLECONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingProgramCourseRole.h"
#include "DBTrainingProgramCourseRoleBase.h"
#include "DBTrainingProgramCourseRoleQual.h"
#include "TmProgramIndex.h"

#include <memory>
#include <tuple>

using TrainingProgramCourseRoleConverterSourceType =
        std::tuple<std::shared_ptr<TmProgramCourseRole>, std::shared_ptr<TmProgramCourseRoleQualIndex>>;

template<>
struct ConverterHelper<TrainingProgramCourseRoleConverterSourceType, DBTrainingProgramCourseRole> {
    static DBTrainingProgramCourseRole *Convert(const TrainingProgramCourseRoleConverterSourceType &src) {
        const auto &[tmProgramCourseRole, tmProgramCourseRoleQualIndex] = src;
        if (!tmProgramCourseRole) {
            return nullptr;
        }

        auto qualRows = tmProgramCourseRoleQualIndex->getByProgramCourseRoleId(tmProgramCourseRole->id);
        std::vector<std::unique_ptr<DBTrainingProgramCourseRoleQual>> roleQuals;
        roleQuals.reserve(qualRows.size());
        for (const auto &roleQual: qualRows) {
            if (!roleQual) {
                continue;
            }
            roleQuals.emplace_back(std::make_unique<DBTrainingProgramCourseRoleQual>(
                    roleQual->id, roleQual->programCourseRoleId, tmProgramCourseRole->id,
                    std::vector<std::string>(roleQual->roleQuals.begin(), roleQual->roleQuals.end()),
                    roleQual->roleQualOption, roleQual->roleNumber));
        }

        auto roleBase = std::make_unique<DBTrainingProgramCourseRoleBase>(
                tmProgramCourseRole->id, tmProgramCourseRole->id,
                std::vector<std::string>(tmProgramCourseRole->bases.begin(), tmProgramCourseRole->bases.end()),
                std::vector<std::string>(tmProgramCourseRole->ranks.begin(), tmProgramCourseRole->ranks.end()),
                std::vector<std::string>(tmProgramCourseRole->fleets.begin(), tmProgramCourseRole->fleets.end()),
                std::vector<std::string>(tmProgramCourseRole->teams.begin(), tmProgramCourseRole->teams.end()),
                std::vector<std::string>(tmProgramCourseRole->actingRanks.begin(), tmProgramCourseRole->actingRanks.end()),
                std::move(roleQuals));

        std::vector<std::unique_ptr<DBTrainingProgramCourseRoleBase>> roleBases;
        roleBases.emplace_back(std::move(roleBase));

        return new DBTrainingProgramCourseRole(tmProgramCourseRole->id, tmProgramCourseRole->programId,
                                              tmProgramCourseRole->programCourseId, tmProgramCourseRole->programCoursePnrId,
                                              tmProgramCourseRole->role, tmProgramCourseRole->roleNumber,
                                              std::move(roleBases));
    }
};

#endif

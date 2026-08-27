//
// Created by haoli on 2026/4/16.
//

#ifndef TRAININGOPTIMIZER_TRAININGCOURSEROLECONVERTERHELPER_H
#define TRAININGOPTIMIZER_TRAININGCOURSEROLECONVERTERHELPER_H

#include "ConverterHelper.h"
#include "DBTrainingCourseRole.h"
#include "TmCourseIndex.h"

#include <memory>
#include <tuple>

using TrainingCourseRoleConverterSourceType =
        std::tuple<std::shared_ptr<TmCourseRole>, std::shared_ptr<TmCourseRoleBaseIndex>,
                   std::shared_ptr<TmCourseRoleQualIndex>, std::shared_ptr<TmCourseRoleDeviceIndex>>;

template<>
struct ConverterHelper<TrainingCourseRoleConverterSourceType, DBTrainingCourseRole> {
    static DBTrainingCourseRole *Convert(const TrainingCourseRoleConverterSourceType &src) {
        const auto &[tmCourseRole, tmCourseRoleBaseIndex, tmCourseRoleQualIndex, tmCourseRoleDeviceIndex] = src;
        if (!tmCourseRole) {
            return nullptr;
        }
        std::vector<std::unique_ptr<DBTrainingCourseRoleBase>> roleBases;
        auto roleBaseRows = tmCourseRoleBaseIndex->getByCourseRoleId(tmCourseRole->id);
        roleBases.reserve(roleBaseRows.size());
        for (const auto &roleBase: roleBaseRows) {
            if (!roleBase) {
                continue;
            }
            std::vector<std::unique_ptr<DBTrainingCourseRoleQual>> quals;
            auto qualRows = tmCourseRoleQualIndex->getByCourseRoleBaseId(roleBase->id);
            quals.reserve(qualRows.size());
            for (const auto &roleQual: qualRows) {
                if (!roleQual) {
                    continue;
                }
                quals.emplace_back(std::make_unique<DBTrainingCourseRoleQual>(
                        roleQual->id, roleQual->tmCourseRoleBaseId, roleQual->condition,
                        std::vector<std::string>(roleQual->quals.begin(), roleQual->quals.end()),
                        roleQual->peopleLimit));
            }
            std::unique_ptr<DBTrainingCourseRoleDevice> device;
            if (auto deviceRows = tmCourseRoleDeviceIndex->getByCourseRoleBaseId(roleBase->id);
                !deviceRows.empty()) {
                const auto& picked = deviceRows.front();
                device = std::make_unique<DBTrainingCourseRoleDevice>(
                        picked->id, picked->tmCourseRoleBaseId, picked->option,
                        std::vector<std::string>(picked->deviceTypes.begin(), picked->deviceTypes.end()),
                        std::vector<std::string>(picked->deviceCodes.begin(), picked->deviceCodes.end()));
            }
            roleBases.emplace_back(std::make_unique<DBTrainingCourseRoleBase>(
                    roleBase->id, roleBase->tmCourseRoleId,
                    std::vector<std::string>(roleBase->bases.begin(), roleBase->bases.end()),
                    std::vector<std::string>(roleBase->ranks.begin(), roleBase->ranks.end()),
                    std::vector<std::string>(roleBase->fleets.begin(), roleBase->fleets.end()),
                    std::vector<std::string>(roleBase->teams.begin(), roleBase->teams.end()),
                    std::vector<std::string>(roleBase->actingRanks.begin(), roleBase->actingRanks.end()),
                    roleBase->operating, std::move(quals), std::move(device)));
        }
        return new DBTrainingCourseRole(tmCourseRole->id, tmCourseRole->courseId, tmCourseRole->role,
                                        tmCourseRole->minCapacity, tmCourseRole->maxCapacity, std::move(roleBases));
    }
};

#endif // TRAININGOPTIMIZER_TRAININGCOURSEROLECONVERTERHELPER_H

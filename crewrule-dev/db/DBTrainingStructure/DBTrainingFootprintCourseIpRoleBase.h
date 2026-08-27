#ifndef TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEIPROLEBASE_H
#define TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEIPROLEBASE_H

#include <vector>
#include <string>
#include <memory>
#include "DBTrainingFootprintCourseIpRoleQual.h"

class DBTrainingFootprintCourseIpRoleBase {
public:
    DBTrainingFootprintCourseIpRoleBase(long long id, long long footprintId, long long footprintCourseId,
                                        long long footprintCourseIpRoleId, std::vector<std::string> fleets,
                                        std::vector<std::string> teams, std::vector<std::string> actingRanks,
                                        std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRoleQual>>&& roleQuals) :
        _id(id), _footprintId(footprintId), _footprintCourseId(footprintCourseId),
        _footprintCourseIpRoleId(footprintCourseIpRoleId), _fleets(std::move(fleets)),
        _teams(std::move(teams)), _actingRanks(std::move(actingRanks)),
        _roleQuals(std::move(roleQuals)) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetFootprintId() const { return _footprintId; }
    [[nodiscard]] long long GetFootprintCourseId() const { return _footprintCourseId; }
    [[nodiscard]] long long GetFootprintCourseIpRoleId() const { return _footprintCourseIpRoleId; }
    [[nodiscard]] const std::vector<std::string>& GetFleets() const { return _fleets; }
    [[nodiscard]] const std::vector<std::string>& GetTeams() const { return _teams; }
    [[nodiscard]] const std::vector<std::string>& GetActingRanks() const { return _actingRanks; }
    [[nodiscard]] const std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRoleQual>>& GetRoleQuals() const { return _roleQuals; }

private:
    long long _id;
    long long _footprintId;
    long long _footprintCourseId;
    long long _footprintCourseIpRoleId;
    std::vector<std::string> _fleets;
    std::vector<std::string> _teams;
    std::vector<std::string> _actingRanks;
    std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRoleQual>> _roleQuals;
};

#endif

#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEIPROLEBASE_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEIPROLEBASE_H

#include <vector>
#include <string>
#include <memory>
#include "DBTrainingProgramCourseIpRoleQual.h"

class DBTrainingProgramCourseIpRoleBase {
public:
    DBTrainingProgramCourseIpRoleBase(long long id, long long programId, long long programCourseId,
                                       long long programCourseIpRoleId, std::vector<std::string> fleets,
                                       std::vector<std::string> teams, std::vector<std::string> actingRanks,
                                       std::vector<std::unique_ptr<DBTrainingProgramCourseIpRoleQual>>&& roleQuals) :
        _id(id), _programId(programId), _programCourseId(programCourseId),
        _programCourseIpRoleId(programCourseIpRoleId), _fleets(std::move(fleets)),
        _teams(std::move(teams)), _actingRanks(std::move(actingRanks)),
        _roleQuals(std::move(roleQuals)) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetProgramId() const { return _programId; }
    [[nodiscard]] long long GetProgramCourseId() const { return _programCourseId; }
    [[nodiscard]] long long GetProgramCourseIpRoleId() const { return _programCourseIpRoleId; }
    [[nodiscard]] const std::vector<std::string>& GetFleets() const { return _fleets; }
    [[nodiscard]] const std::vector<std::string>& GetTeams() const { return _teams; }
    [[nodiscard]] const std::vector<std::string>& GetActingRanks() const { return _actingRanks; }
    [[nodiscard]] const std::vector<std::unique_ptr<DBTrainingProgramCourseIpRoleQual>>& GetRoleQuals() const { return _roleQuals; }

private:
    long long _id;
    long long _programId;
    long long _programCourseId;
    long long _programCourseIpRoleId;
    std::vector<std::string> _fleets;
    std::vector<std::string> _teams;
    std::vector<std::string> _actingRanks;
    std::vector<std::unique_ptr<DBTrainingProgramCourseIpRoleQual>> _roleQuals;
};

#endif

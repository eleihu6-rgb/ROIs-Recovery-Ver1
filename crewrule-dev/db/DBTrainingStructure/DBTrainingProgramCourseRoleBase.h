#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEROLEBASE_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEROLEBASE_H

#include <vector>
#include <string>
#include <memory>
#include "DBTrainingProgramCourseRoleQual.h"

class DBTrainingProgramCourseRoleBase {
public:
    DBTrainingProgramCourseRoleBase(long long id, long long programCourseRoleId,
                                       std::vector<std::string> bases, std::vector<std::string> ranks,
                                       std::vector<std::string> fleets, std::vector<std::string> teams,
                                       std::vector<std::string> actingRanks,
                                       std::vector<std::unique_ptr<DBTrainingProgramCourseRoleQual>>&& roleQuals) :
        _id(id), _programCourseRoleId(programCourseRoleId),
        _bases(std::move(bases)), _ranks(std::move(ranks)),
        _fleets(std::move(fleets)), _teams(std::move(teams)),
        _actingRanks(std::move(actingRanks)), _roleQuals(std::move(roleQuals)) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetProgramCourseRoleId() const { return _programCourseRoleId; }
    [[nodiscard]] const std::vector<std::string>& GetBases() const { return _bases; }
    [[nodiscard]] const std::vector<std::string>& GetRanks() const { return _ranks; }
    [[nodiscard]] const std::vector<std::string>& GetFleets() const { return _fleets; }
    [[nodiscard]] const std::vector<std::string>& GetTeams() const { return _teams; }
    [[nodiscard]] const std::vector<std::string>& GetActingRanks() const { return _actingRanks; }
    [[nodiscard]] const std::vector<std::unique_ptr<DBTrainingProgramCourseRoleQual>>& GetRoleQuals() const { return _roleQuals; }

private:
    long long _id;
    long long _programCourseRoleId;
    std::vector<std::string> _bases;
    std::vector<std::string> _ranks;
    std::vector<std::string> _fleets;
    std::vector<std::string> _teams;
    std::vector<std::string> _actingRanks;
    std::vector<std::unique_ptr<DBTrainingProgramCourseRoleQual>> _roleQuals;
};

#endif

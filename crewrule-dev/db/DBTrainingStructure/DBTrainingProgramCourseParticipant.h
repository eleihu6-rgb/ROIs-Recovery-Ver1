//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEPARTICIPANT_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEPARTICIPANT_H

#include <utility>

#include "DBTrainingCourseRoleRequirement.h"

class DBTrainingProgramCourseParticipant {
public:
    DBTrainingProgramCourseParticipant() = default;

    DBTrainingProgramCourseParticipant(long long programCourseId, DBTrainingCourseRoleRequirement::RoleType role,
                                       std::string crewId, long long rosterId, long long rosterGroundId, size_t sector, long long scenarioId)
            : _programCourseId(programCourseId), _role(role), _crewId(std::move(crewId)), _rosterId(rosterId),
              _rosterGroundId(rosterGroundId), _sector(sector), _scenarioId(scenarioId){}

    const long long GetProgramCourseId() const { return _programCourseId; }

    void SetProgramCourseId(long long programCourseId) { _programCourseId = programCourseId; }

    const DBTrainingCourseRoleRequirement::RoleType GetRole() const { return _role; }

    void SetRole(DBTrainingCourseRoleRequirement::RoleType role) { _role = role; }

    const std::string &GetCrewId() const { return _crewId; }

    void SetCrewId(const std::string &crewId) { _crewId = crewId; }

    const long long GetRosterId() const { return _rosterId; }

    void SetRosterId(long long rosterId) { _rosterId = rosterId; }

    const long long GetRosterGroundId() const { return _rosterGroundId; }

    void SetRosterGroundId(long long rosterGroundId) { _rosterGroundId = rosterGroundId; }

    void SetSector(size_t sector) { _sector = sector; }

    const size_t GetSector() const { return _sector; }

    void SetScenarioId(long long scenarioId) { _scenarioId = scenarioId; }

    const long long GetScenarioId() const { return _scenarioId; }

private:
    long long _programCourseId;
    DBTrainingCourseRoleRequirement::RoleType _role;
    std::string _crewId;
    long long _rosterId;
    long long _rosterGroundId;
    size_t _sector;
    long long _scenarioId;
};


#endif //TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEPARTICIPANT_H

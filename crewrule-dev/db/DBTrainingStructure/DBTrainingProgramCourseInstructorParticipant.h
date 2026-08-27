//
// Created by haoli on 2026/1/12.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEINSTRUCTORPARTICIPANT_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEINSTRUCTORPARTICIPANT_H

#include <utility>

#include "DBTrainingCourseRoleRequirement.h"

class DBTrainingProgramCourseInstructorParticipant {
public:
    DBTrainingProgramCourseInstructorParticipant() = default;

    DBTrainingProgramCourseInstructorParticipant(long long programCourseInstructorId, const std::vector<long long> &programCourseIds,DBTrainingCourseRoleRequirement::RoleType role,
                                       std::string crewId, long long rosterId, long long rosterGroundId, long long scenarioId)
            : _programCourseInstructorId(programCourseInstructorId), _programCourseIds(programCourseIds), _role(role),
            _crewId(std::move(crewId)), _rosterId(rosterId), _rosterGroundId(rosterGroundId), _scenarioId(scenarioId){}

    const long long GetProgramCourseInstructorId() const { return _programCourseInstructorId; }

    void SetProgramCourseInstructorId(long long programCourseInstructorId) { _programCourseInstructorId = programCourseInstructorId; }

    const std::vector<long long> &GetProgramCourseIds() const { return _programCourseIds; }

    void SetProgramCourseIds(const std::vector<long long> &programCourseIds) { _programCourseIds = programCourseIds; }

    const DBTrainingCourseRoleRequirement::RoleType GetRole() const { return _role; }

    void SetRole(DBTrainingCourseRoleRequirement::RoleType role) { _role = role; }

    const std::string &GetCrewId() const { return _crewId; }

    void SetCrewId(const std::string &crewId) { _crewId = crewId; }

    const long long GetRosterId() const { return _rosterId; }

    void SetRosterId(long long rosterId) { _rosterId = rosterId; }

    const long long GetRosterGroundId() const { return _rosterGroundId; }

    void SetRosterGroundId(long long rosterGroundId) { _rosterGroundId = rosterGroundId; }

    void SetScenarioId(long long scenarioId) { _scenarioId = scenarioId; }

    const long long GetScenarioId() const { return _scenarioId; }

private:
    long long _programCourseInstructorId;
    std::vector<long long> _programCourseIds;
    DBTrainingCourseRoleRequirement::RoleType _role;
    std::string _crewId;
    long long _rosterId;
    long long _rosterGroundId;
    long long _scenarioId;
};
#endif //TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEINSTRUCTORPARTICIPANT_H

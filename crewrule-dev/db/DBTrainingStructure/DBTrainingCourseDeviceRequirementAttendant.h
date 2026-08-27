//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENTATTENDANT_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENTATTENDANT_H

#include "DBTrainingCourseRoleRequirement.h"

class DBTrainingCourseDeviceRequirementAttendant {
public:
    DBTrainingCourseDeviceRequirementAttendant(long long deviceRequirementId,
                                               DBTrainingCourseRoleRequirement::RoleType roleType,
                                               const std::string &base,
                                               const std::string &rank, const std::string &fleet,
                                               const std::string &team,
                                               const std::string &qualification, const std::string &certification,
                                               unsigned int lowerRoleNumber, unsigned int upperRoleNumber) :
            _deviceRequirementId(deviceRequirementId), _roleType(roleType), _base(base), _rank(rank), _fleet(fleet),
            _team(team), _qualification(qualification), _certification(certification),
            _lowerRoleNumber(lowerRoleNumber),
            _upperRoleNumber(upperRoleNumber) {}

    const long long GetDeviceRequirementId() const { return _deviceRequirementId; }

    void SetDeviceRequirementId(long long id) { _deviceRequirementId = id; }

    const DBTrainingCourseRoleRequirement::RoleType GetRoleType() const { return _roleType; }

    void SetRoleType(DBTrainingCourseRoleRequirement::RoleType type) { _roleType = type; }

    const std::string &GetBase() const { return _base; }

    void SetBase(const std::string &base) { _base = base; }

    const std::string &GetRank() const { return _rank; }

    void SetRank(const std::string &rank) { _rank = rank; }

    const std::string &GetFleet() const { return _fleet; }

    void SetFleet(const std::string &fleet) { _fleet = fleet; }

    const std::string &GetTeam() const { return _team; }

    void SetTeam(const std::string &team) { _team = team; }

    const std::string &GetQualification() const { return _qualification; }

    void SetQualification(const std::string &qualification) { _qualification = qualification; }

    const std::string &GetCertification() const { return _certification; }

    void SetCertification(const std::string &certification) { _certification = certification; }

    const unsigned int GetLowerRoleNumber() const { return _lowerRoleNumber; }

    void SetLowerRoleNumber(unsigned int lowerRoleNumber) { _lowerRoleNumber = lowerRoleNumber; }

    const unsigned int GetUpperRoleNumber() const { return _upperRoleNumber; }

    void SetUpperRoleNumber(unsigned int upperRoleNumber) { _upperRoleNumber = upperRoleNumber; }

private:
    long long _deviceRequirementId;
    DBTrainingCourseRoleRequirement::RoleType _roleType;
    std::string _base;
    std::string _rank;
    std::string _fleet;
    std::string _team;
    std::string _qualification;
    std::string _certification;
    unsigned int _lowerRoleNumber;
    unsigned int _upperRoleNumber;
};


#endif //TRAININGOPTIMIZER_DBTRAININGCOURSEDEVICEREQUIREMENTATTENDANT_H

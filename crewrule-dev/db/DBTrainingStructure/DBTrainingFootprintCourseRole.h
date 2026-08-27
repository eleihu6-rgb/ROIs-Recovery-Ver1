#ifndef TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEROLE_H
#define TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEROLE_H

#include <vector>
#include <string>
#include <memory>
#include "DBTrainingFootprintCourseRoleBase.h"

class DBTrainingFootprintCourseRole {
public:
    DBTrainingFootprintCourseRole(long long id, long long footprintId, long long footprintCourseId,
                                  long long footprintCourseTraineeId, std::string role, int roleNumber,
                                  std::vector<std::unique_ptr<DBTrainingFootprintCourseRoleBase>>&& roleBases) :
        _id(id), _footprintId(footprintId), _footprintCourseId(footprintCourseId),
        _footprintCourseTraineeId(footprintCourseTraineeId), _role(std::move(role)),
        _roleNumber(roleNumber), _roleBases(std::move(roleBases)) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetFootprintId() const { return _footprintId; }
    [[nodiscard]] long long GetFootprintCourseId() const { return _footprintCourseId; }
    [[nodiscard]] long long GetFootprintCourseTraineeId() const { return _footprintCourseTraineeId; }
    [[nodiscard]] const std::string& GetRole() const { return _role; }
    [[nodiscard]] int GetRoleNumber() const { return _roleNumber; }
    [[nodiscard]] const std::vector<std::unique_ptr<DBTrainingFootprintCourseRoleBase>>& GetRoleBases() const { return _roleBases; }

private:
    long long _id;
    long long _footprintId;
    long long _footprintCourseId;
    long long _footprintCourseTraineeId;
    std::string _role;
    int _roleNumber;
    std::vector<std::unique_ptr<DBTrainingFootprintCourseRoleBase>> _roleBases;
};

#endif

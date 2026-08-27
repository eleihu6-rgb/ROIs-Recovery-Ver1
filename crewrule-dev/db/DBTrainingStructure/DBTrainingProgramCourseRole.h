#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEROLE_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEROLE_H

#include <vector>
#include <string>
#include <memory>
#include "DBTrainingProgramCourseRoleBase.h"

class DBTrainingProgramCourseRole {
public:
    DBTrainingProgramCourseRole(long long id, long long programId, long long programCourseId,
                                   long long programCoursePnrId, std::string role, int roleNumber,
                                   std::vector<std::unique_ptr<DBTrainingProgramCourseRoleBase>>&& roleBases) :
        _id(id), _programId(programId), _programCourseId(programCourseId),
        _programCoursePnrId(programCoursePnrId), _role(std::move(role)),
        _roleNumber(roleNumber), _roleBases(std::move(roleBases)) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetProgramId() const { return _programId; }
    [[nodiscard]] long long GetProgramCourseId() const { return _programCourseId; }
    [[nodiscard]] long long GetProgramCoursePnrId() const { return _programCoursePnrId; }
    [[nodiscard]] const std::string& GetRole() const { return _role; }
    [[nodiscard]] int GetRoleNumber() const { return _roleNumber; }
    [[nodiscard]] const std::vector<std::unique_ptr<DBTrainingProgramCourseRoleBase>>& GetRoleBases() const { return _roleBases; }

private:
    long long _id;
    long long _programId;
    long long _programCourseId;
    long long _programCoursePnrId;
    std::string _role;
    int _roleNumber;
    std::vector<std::unique_ptr<DBTrainingProgramCourseRoleBase>> _roleBases;
};

#endif

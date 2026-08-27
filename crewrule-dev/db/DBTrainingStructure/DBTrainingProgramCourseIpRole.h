#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEIPROLE_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEIPROLE_H

#include <vector>
#include <string>
#include <memory>
#include "DBTrainingProgramCourseIpRoleBase.h"

class DBTrainingProgramCourseIpRole {
public:
    DBTrainingProgramCourseIpRole(long long id, long long programId, long long programCourseId,
                                   long long programCoursePnrId, std::vector<std::string> bases,
                                   std::vector<std::string> ranks,
                                   std::vector<std::unique_ptr<DBTrainingProgramCourseIpRoleBase>>&& roleBases) :
        _id(id), _programId(programId), _programCourseId(programCourseId),
        _programCoursePnrId(programCoursePnrId), _bases(std::move(bases)),
        _ranks(std::move(ranks)), _roleBases(std::move(roleBases)) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetProgramId() const { return _programId; }
    [[nodiscard]] long long GetProgramCourseId() const { return _programCourseId; }
    [[nodiscard]] long long GetProgramCoursePnrId() const { return _programCoursePnrId; }
    [[nodiscard]] const std::vector<std::string>& GetBases() const { return _bases; }
    [[nodiscard]] const std::vector<std::string>& GetRanks() const { return _ranks; }
    [[nodiscard]] const std::vector<std::unique_ptr<DBTrainingProgramCourseIpRoleBase>>& GetRoleBases() const { return _roleBases; }

private:
    long long _id;
    long long _programId;
    long long _programCourseId;
    long long _programCoursePnrId;
    std::vector<std::string> _bases;
    std::vector<std::string> _ranks;
    std::vector<std::unique_ptr<DBTrainingProgramCourseIpRoleBase>> _roleBases;
};

#endif

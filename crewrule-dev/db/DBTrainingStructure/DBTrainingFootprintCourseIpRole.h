#ifndef TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEIPROLE_H
#define TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEIPROLE_H

#include <vector>
#include <string>
#include <memory>
#include "DBTrainingFootprintCourseIpRoleBase.h"

class DBTrainingFootprintCourseIpRole {
public:
    DBTrainingFootprintCourseIpRole(long long id, long long footprintId, long long footprintCourseId,
                                    long long footprintCourseTraineeId, std::vector<std::string> bases,
                                    std::vector<std::string> ranks,
                                    std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRoleBase>>&& roleBases) :
        _id(id), _footprintId(footprintId), _footprintCourseId(footprintCourseId),
        _footprintCourseTraineeId(footprintCourseTraineeId), _bases(std::move(bases)),
        _ranks(std::move(ranks)), _roleBases(std::move(roleBases)) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetFootprintId() const { return _footprintId; }
    [[nodiscard]] long long GetFootprintCourseId() const { return _footprintCourseId; }
    [[nodiscard]] long long GetFootprintCourseTraineeId() const { return _footprintCourseTraineeId; }
    [[nodiscard]] const std::vector<std::string>& GetBases() const { return _bases; }
    [[nodiscard]] const std::vector<std::string>& GetRanks() const { return _ranks; }
    [[nodiscard]] const std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRoleBase>>& GetRoleBases() const { return _roleBases; }

private:
    long long _id;
    long long _footprintId;
    long long _footprintCourseId;
    long long _footprintCourseTraineeId;
    std::vector<std::string> _bases;
    std::vector<std::string> _ranks;
    std::vector<std::unique_ptr<DBTrainingFootprintCourseIpRoleBase>> _roleBases;
};

#endif

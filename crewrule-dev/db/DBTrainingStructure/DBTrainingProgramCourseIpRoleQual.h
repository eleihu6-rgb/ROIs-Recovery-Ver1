#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEIPROLEQUAL_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSEIPROLEQUAL_H

#include <vector>
#include <string>

class DBTrainingProgramCourseIpRoleQual {
public:
    DBTrainingProgramCourseIpRoleQual(long long id, long long programId, long long programCourseId,
                                       long long programCourseIpRoleId, long long programCourseIpRoleBaseId,
                                       std::vector<std::string> roleQuals, std::string roleQualOption,
                                       int roleNumber) :
        _id(id), _programId(programId), _programCourseId(programCourseId),
        _programCourseIpRoleId(programCourseIpRoleId), _programCourseIpRoleBaseId(programCourseIpRoleBaseId),
        _roleQuals(std::move(roleQuals)), _roleQualOption(std::move(roleQualOption)),
        _roleNumber(roleNumber) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetProgramId() const { return _programId; }
    [[nodiscard]] long long GetProgramCourseId() const { return _programCourseId; }
    [[nodiscard]] long long GetProgramCourseIpRoleId() const { return _programCourseIpRoleId; }
    [[nodiscard]] long long GetProgramCourseIpRoleBaseId() const { return _programCourseIpRoleBaseId; }
    [[nodiscard]] const std::vector<std::string>& GetRoleQuals() const { return _roleQuals; }
    [[nodiscard]] const std::string& GetRoleQualOption() const { return _roleQualOption; }
    [[nodiscard]] int GetRoleNumber() const { return _roleNumber; }

private:
    long long _id;
    long long _programId;
    long long _programCourseId;
    long long _programCourseIpRoleId;
    long long _programCourseIpRoleBaseId;
    std::vector<std::string> _roleQuals;
    std::string _roleQualOption;
    int _roleNumber;
};

#endif

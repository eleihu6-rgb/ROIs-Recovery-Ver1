#ifndef TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEIPROLEQUAL_H
#define TRAININGOPTIMIZER_DBTRAININGFOOTPRINTCOURSEIPROLEQUAL_H

#include <vector>
#include <string>

class DBTrainingFootprintCourseIpRoleQual {
public:
    DBTrainingFootprintCourseIpRoleQual(long long id, long long footprintId, long long footprintCourseId,
                                        long long footprintCourseIpRoleId, long long footprintCourseIpRoleBaseId,
                                        std::vector<std::string> roleQuals, std::string roleQualOption,
                                        int roleNumber) :
        _id(id), _footprintId(footprintId), _footprintCourseId(footprintCourseId),
        _footprintCourseIpRoleId(footprintCourseIpRoleId), _footprintCourseIpRoleBaseId(footprintCourseIpRoleBaseId),
        _roleQuals(std::move(roleQuals)), _roleQualOption(std::move(roleQualOption)),
        _roleNumber(roleNumber) {}

    [[nodiscard]] long long GetId() const { return _id; }
    [[nodiscard]] long long GetFootprintId() const { return _footprintId; }
    [[nodiscard]] long long GetFootprintCourseId() const { return _footprintCourseId; }
    [[nodiscard]] long long GetFootprintCourseIpRoleId() const { return _footprintCourseIpRoleId; }
    [[nodiscard]] long long GetFootprintCourseIpRoleBaseId() const { return _footprintCourseIpRoleBaseId; }
    [[nodiscard]] const std::vector<std::string>& GetRoleQuals() const { return _roleQuals; }
    [[nodiscard]] const std::string& GetRoleQualOption() const { return _roleQualOption; }
    [[nodiscard]] int GetRoleNumber() const { return _roleNumber; }

private:
    long long _id;
    long long _footprintId;
    long long _footprintCourseId;
    long long _footprintCourseIpRoleId;
    long long _footprintCourseIpRoleBaseId;
    std::vector<std::string> _roleQuals;
    std::string _roleQualOption;
    int _roleNumber;
};

#endif

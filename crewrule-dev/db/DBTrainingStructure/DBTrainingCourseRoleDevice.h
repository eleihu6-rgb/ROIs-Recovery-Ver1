//
// Created by haoli on 2026/4/16.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGCOURSEROLEDEVICE_H
#define TRAININGOPTIMIZER_DBTRAININGCOURSEROLEDEVICE_H

#include <string>
#include <vector>

class DBTrainingCourseRoleDevice {
public:
    DBTrainingCourseRoleDevice(long long id, long long tmCourseBaseId, std::string deviceOption,
                               std::vector<std::string> deviceTypes, std::vector<std::string> deviceCodes)
            : _id(id), _tmCourseBaseId(tmCourseBaseId), _deviceOption(std::move(deviceOption)),
              _deviceTypes(std::move(deviceTypes)), _deviceCodes(std::move(deviceCodes)) {}

    long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    long long GetTmCourseBaseId() const { return _tmCourseBaseId; }

    void SetTmCourseBaseId(long long tmCourseBaseId) { _tmCourseBaseId = tmCourseBaseId; }

    const std::string &GetDeviceOption() const { return _deviceOption; }

    void SetDeviceOption(std::string deviceOption) { _deviceOption = std::move(deviceOption); }

    const std::vector<std::string> &GetDeviceTypes() const { return _deviceTypes; }

    void SetDeviceTypes(std::vector<std::string> deviceTypes) { _deviceTypes = std::move(deviceTypes); }

    const std::vector<std::string> &GetDeviceCodes() const { return _deviceCodes; }

    void SetDeviceCodes(std::vector<std::string> deviceCodes) { _deviceCodes = std::move(deviceCodes); }

private:
    long long _id{0};
    long long _tmCourseBaseId{0};
    std::string _deviceOption;
    std::vector<std::string> _deviceTypes;
    std::vector<std::string> _deviceCodes;
};

#endif // TRAININGOPTIMIZER_DBTRAININGCOURSEROLEDEVICE_H

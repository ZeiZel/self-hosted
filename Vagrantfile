# min: 2 PC, 1 for monitoring and 1 for rest services
# that saves server on falling down

Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/bionic64"

  config.vm.provision "ansible" do |ansible|
    ansible.playbook = "ansible/site.yml"
  end
end
